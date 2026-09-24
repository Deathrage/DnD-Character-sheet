# Cloud backup — Design

Adds optional cloud backup to Firestore: upload a character as a dated version, list, restore and
delete versions. Amends `2026-07-25-dnd-character-sheet-design.md` **§1**: the non-goal "no
accounts" becomes "accounts only for optional cloud backup; the local app stays complete and free
without one". Discharges the "Remote backup and restore" entry in `docs/BACKLOG.md`, with one
deliberate change to its layout (§3 below).

## 1. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Auth | Google sign-in only, via `signInWithRedirect` | No signup, password or email-verification flows. Redirect, not popup: popups are unreliable in an installed PWA and on iOS |
| `authDomain` | `dnd-character-sheet-64a24.web.app` | Same origin as the app, so the `/__/auth/handler` redirect does not cross origins |
| Who may use it | Any Google account, no allow-list | User's decision. Adding one later is a one-line rule change |
| Versions | Every upload is a new version; nothing is ever deleted automatically | User's decision. The player manages storage on the cloud screen |
| Trigger | A dedicated **Upload to cloud** button, like Export | No automatic sync. Firestore bills per write |
| Restore id | Keeps the character's id; a dialog when that id already exists locally | A restore on a new device is the same character, not a copy |
| SDK | `firebase/app`, `firebase/auth`, `firebase/firestore/lite`, loaded by dynamic `import()` | Lite has no realtime listeners or offline cache, neither of which this needs. Dynamic, so a player who never uses the cloud never downloads Firebase and the offline start is untouched |

## 2. Layers

Follows the existing `ui → business → data` rule.

- **`src/data/remote/`** is the only code that imports `firebase` (lint-enforced).
  - `config.ts`: the Firebase web config. Public by design; security is the rules.
  - `codec.ts`: `{ doc, portrait }` ↔ Firestore fields. Sheet: `JSON.stringify` → gzip with the
    native `CompressionStream` → `Bytes`. Portrait: base64 data URL ↔ raw JPEG `Bytes`.
  - `cloudRepository.ts`: an interface (`signIn`, `signOut`, `currentUser`, `listCharacters`,
    `upload`, `getPayload`, `deleteVersion`, `deleteCharacter`) and its Firestore implementation.
    Tests inject an in-memory fake, the same way the library tests inject a repository.
- **`src/business/cloudBackup.ts`**: `CloudBackup`, a sibling of `StorageGate`, exported from
  `index.ts` and constructed in `main.tsx` beside the library.
- **`src/ui/`**: an Upload to cloud button on the sheet, a Cloud button on the list, a `#/cloud`
  route, and a conflict dialog.

## 3. Firestore layout

```
users/{uid}/characters/{characterId}                         character document (the index)
users/{uid}/characters/{characterId}/payloads/{uploadedAt}   payload document (the data)
```

- `uid`: the Google account's Firebase Auth id. Same on every device for the same account.
- `characterId`: the character's own `doc.id`, the IndexedDB key.
- `uploadedAt`: ISO 8601 timestamp of the upload with milliseconds, e.g.
  `2026-09-24T18:03:12.345Z`. It is the version's identity: the map key in the index and the
  payload's document id. ISO strings sort lexically in time order. Two uploads of one character in
  the same millisecond would collide; a button press cannot produce that.

Nothing is stored at `users/{uid}` itself; Firestore does not need a parent document to exist.

**Differs from the backlog**, which proposed top-level `characters/{id}` and `portraits/{id}`
mirroring the local stores. Per-user paths make the security rule one line. The portrait moves
into the payload because a version must be restorable as a whole, and the separate store existed
to avoid rewriting the portrait on every sync — there is no sync.

### Character document

```ts
{
  versions: {
    [uploadedAt: string]: {
      name: string;
      classes: { name: string; level: number }[];
      totalLevel: number;       // from summarize(), the value the list already shows
      sheetUpdatedAt: string;   // the sheet's updatedAt at upload; the conflict dialog compares it
      schemaVersion: number;    // lets the screen flag "made by a newer version" without a download
      bytes: number;            // payload size, for the usage display
    };
  };
}
```

Each entry describes one upload in about 200 bytes. There is no "current name" field: the screen
shows the newest entry (the largest key), so nothing is stored twice and nothing can drift.

### Payload document

```ts
{ sheet: Bytes; portrait: Bytes | null }
```

Written once, never changed, read only on restore. Typically 20–50 KB of sheet plus at most
~23 KB of portrait.

The index and the payload are separate documents because Firestore always downloads whole
documents: opening the cloud screen must not download every version's data.

## 4. Operations

**Upload.**
1. `library.flush()`, so pending edits are in IndexedDB.
2. Encode the sheet (`toDocument()`) and the portrait.
3. One `writeBatch`: `set(payloads/{uploadedAt}, { sheet, portrait })` and
   `set(characters/{characterId}, { versions: { [uploadedAt]: entry } }, { merge: true })`.

Both land or neither does. The merge adds one key and leaves the others, so two devices uploading
at once do not lose each other's version.

**List.** `getDocs(users/{uid}/characters)`: one read per character. That is everything the cloud
screen shows, including total usage (the sum of `bytes`).

**Restore.**
1. `getDoc(payloads/{uploadedAt})`.
2. Decode: gunzip → `JSON.parse` → `parseCharacter`, the same validate-and-migrate path file
   import uses. A damaged or too-new payload fails with a typed reason and is never repaired (the
   one promise).
3. `characterId` not in this browser: store it under that id, no dialog.
4. Already present: return a conflict, and the UI asks.
   - **Replace**: document and portrait saved under the existing id in one transaction, row
     refreshed in place. Refused while that character's sheet is open, or its autosave would write
     the old copy straight back.
   - **Keep both**: stored under a new id through `#adopt`, as file import does.

**Delete a version.** One `writeBatch`: delete `payloads/{uploadedAt}` and remove that key with
`deleteField()`, addressed as `new FieldPath('versions', uploadedAt)` because the key contains
dots. When it is the last version, the batch deletes the character document instead.

**Delete a character.** Delete every payload named in its map, then the character document, in
batches of at most 500. The index is deleted last: a batch that fails partway leaves the index
still naming the payloads not yet deleted, so a retry finishes the job and the index never points
at nothing while payloads remain.

Every Firebase API named here is to be verified against the installed `firebase` version before it
is relied on (AGENTS.md).

## 5. Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Everything else is denied by default.

## 6. Business layer

`CloudBackup`:

- **Observable state**
  - `status`: `signedOut` | `signingIn` | `signedIn` | `unavailable` (offline, or Firebase
    failed to load).
  - `user`: display name and email.
  - `characters`: the index, per character its newest name and level and its versions
    newest-first.
  - `totalBytes`, and `busy` while an operation runs.
- **Actions**
  - `signIn()`, `signOut()`, `refresh()`.
  - `upload(sheet)`: flushes the library, then uploads.
  - `restore(characterId, uploadedAt, choice?)` →
    `{ ok: true } | { ok: false; message } | { conflict: { localUpdatedAt, cloudUpdatedAt } }`.
    The UI shows the dialog on a conflict and calls again with `'replace'` or `'keepBoth'`.
  - `deleteVersion(characterId, uploadedAt)`, `deleteCharacter(characterId)`.
- **`CharacterLibraryBO.restore(doc, portrait, mode)`** is the new library method beside `add`,
  so storing a restored character goes through the same paths as everything else.
- Firebase is loaded on the first cloud action, never on launch.

**Errors.** Every cloud failure becomes one sentence, never a throw that reaches React:
- offline
- sign-in cancelled
- permission denied
- quota exhausted (`resource-exhausted`)
- damaged payload (`describeLoadError`)
- newer schema version (the same sentence as file import)

Cloud failures stay out of `StorageGate`, whose banner is about this device's storage.

## 7. Screens

- **Sheet: Upload to cloud**, beside Export.
  - Signed out, it signs in first. The redirect reloads the page, so the pending upload's
    character id is kept in `sessionStorage` and resumed once. Autosave has already flushed on
    `pagehide`.
  - Result shown inline: "Uploaded 24 Sep 18:03", or the error sentence.
- **List: Cloud**, next to Import, opens `#/cloud`.
- **`#/cloud`.**
  - Header: "Signed in as …", Sign out, "Using 3.4 MB".
  - Signed out: only Sign in with Google.
  - Otherwise one card per character: newest name and level. Under it, each version's upload
    time, "last edited" time, size, and Restore / Delete, plus **Delete all versions** per
    card.
  - Both deletes confirm "This can't be undone".
  - After a restore, return to the list.
- **Conflict dialog.**
  - Text: "Zahir is already in this browser. This browser's copy: edited 30 Sep 20:10. Cloud
    version: edited 24 Sep 17:58."
  - Buttons: **Replace**, **Keep both**, **Cancel**.
  - When the cloud copy is the older one, the dialog says so explicitly.

## 8. Testing

Colocated. Every test is proven to bite.

- **`codec.test.ts`**: gzip round-trip of `testAssets/zahir-ibn-talaar-2026-09-23.json`; portrait
  data URL ↔ Bytes; corrupt gzip and invalid JSON fail with a typed reason. Node 24's native
  `CompressionStream`, no mocks.
- **`cloudBackup.test.ts`**, over an in-memory fake repository:
  - upload writes one entry and one payload
  - restore into an empty browser keeps the id
  - an existing id returns a conflict; Replace overwrites; Keep both copies
  - Replace is refused while the sheet is open
  - deleting the last version removes the character
  - a partially failed character delete can be retried
  - a newer-schema payload is reported, not stored
- **Rules**: checked by hand against the Firestore emulator (another uid denied, own allowed).
  No `@firebase/rules-unit-testing` harness; add it if the rules grow beyond one line.
- **End to end**: upload → delete locally → restore, in a real browser against the live project.

## 9. Config and delivery

- `npm install firebase`.
- `firestore.rules`, and a `firestore` block in `firebase.json`.
- `deploy.yml` deploys the rules on push to `main`, alongside hosting.
- ESLint: `firebase` imports are restricted to `src/data/remote/`.
- **Console, by hand:**
  - Create the Firestore database. Its location is permanent; `eur3` is suggested.
  - Enable the Google provider in Auth.
  - Confirm `dnd-character-sheet-64a24.web.app` and `localhost` are authorized domains.
- **Docs:**
  - Amend spec §1.
  - Add a cloud section to AGENTS.md.
  - Move the backlog entry to Done, leaving automatic sync as its own entry.

## 10. Accepted risks and ceilings

- **Shared quota.** Any Google account can write, and Spark's ~1 GiB storage and ~20k writes/day
  are shared by all users. Once a quota runs out, Firestore stops accepting writes (on Spark
  nothing is billed). Safe only while the app is obscure. Upgrade path: an allow-list or
  subscription check in the rules.
- **~5,000 versions per character** before the character document reaches Firestore's 1 MiB
  limit. Weekly uploads for ten years are 520. Upgrade path: move the entries into a subcollection.
- **Each version stores its own portrait**, up to ~23 KB. Upgrade path: store each distinct
  portrait once, under a hash, with reference counting on delete.

## 11. Out of scope

- Automatic sync.
- The subscription and any allow-list.
- Sharing characters.
- Deduplicating portraits.
