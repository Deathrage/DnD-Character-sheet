# Cloud quota and layout versioning — Design

Limits each player's cloud data to 1 MiB, shows usage against that limit, and versions the
Firestore layout the way character documents are versioned. Replaces §3–§5 of
`2026-09-24-cloud-backup-design.md` and amends its §6–§11, as listed in §11 below.

## 1. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Quota | 1 MiB (1,048,576 bytes) per player, overhead included | User's decision ("1 MB"). It is exactly Firestore's maximum document size, which is what makes the next row possible |
| Layout | **One document per player**, `cloud/{uid}` | Firestore enforces the quota itself, and it counts everything: keys, field names, overhead. Nothing a client sends can escape it |
| Usage shown | "Using 312.4 KB of 1 MB", computed from the downloaded document | The client already holds the whole document. A stored counter would be a number the rules cannot verify, because rules cannot measure a map |
| Versioning | `layoutVersion` inside the document, a strict Zod schema per version, parsed by the same migration walk as characters | The same discipline as `schemaVersion`: an old document is read at its own version and never silently altered. One walk, not two copies (§8) |
| Portraits | In the document, **stored once per distinct image**, keyed by SHA-256 | A portrait rarely changes between uploads. Stored per version it would take ~40% of the quota |
| Sheets | The gzipped document bytes, as now, and **nothing else about them** | Each sheet carries its own `schemaVersion` and is migrated by `parseCharacter`. The layout never looks inside it and keeps no summary of it, so a sheet schema change can never force a layout change |
| Browsing | Opening the cloud screen downloads the whole document; Restore uses that copy | User's decision, over a separate index document (§10). A version never changes once uploaded, so the copy in memory is exact |
| Export files | Unchanged: `{ sheet, portrait }` | User's decision |
| Existing cloud data | Wiped, by hand, once | The multi-document layout went live on 2026-09-25 and holds only test backups. Layout 1 therefore needs no reader and no migration |

**Considered and rejected: many documents plus a verified counter.** The existing layout, with a
`bytes` counter at `users/{uid}` that the rules check against every payload created or deleted
in the same batch. A spike against the Firestore emulator (43 checks, each rule mutation-tested)
showed it can be made tamper-proof. It needs `increment()` with `{ merge: true }` (without merge,
`set` replaces the document and the increment starts from zero), a flat charge per version for
the overhead rules cannot see, format checks on client-chosen ids, one batch per deleted version,
and about 100 lines of rules that every future layout change would have to re-verify. It remains
the upgrade path if a quota above 1 MiB is ever needed (§10).

## 2. Layout 2

```
cloud/{uid}
```

```ts
{
  layoutVersion: 2,
  portraits?: { [sha256: string]: Bytes },           // raw JPEG, lowercase hex SHA-256 of those bytes
  characters: {
    [characterId: string]: {
      [uploadedAt: string]: {
        sheet: Bytes;                                  // JSON.stringify(doc), gzipped
        portrait: string | null;                       // a key of `portraits`
      };
    };
  };
}
```

- `uid`, `characterId` and `uploadedAt` mean what they meant in layout 1 (cloud-backup §3).
- **No summary entry.** Layout 1's index held `name`, `classes`, `totalLevel`,
  `sheetUpdatedAt`, `schemaVersion` and `bytes`, so the screen could list versions without
  downloading them. Here every sheet is downloaded anyway (§4), so the screen summarises each
  version from its sheet. The layout carries no copy of anything the sheet already says, so
  nothing can drift.
- A character with no versions is removed from `characters`, never left as an empty map, so the
  layout-1 rule that hid empty indexes (cloud-backup §12.3) has nothing left to hide.
- Every portrait key is referenced by at least one version. Deletes keep this true (§4).
- **`portraits` may be absent.** A player whose uploads never had a portrait has no `portraits`
  field, because an upload without one must not write it (§4). Absent and `{}` mean the same.
- The parse schema is strict at every level, like `src/data/schema/v1/`: an unknown key fails
  the read with a typed reason instead of being dropped. Adding a field means a new layout
  version.

**Capacity.** Zahir (`testAssets/`) is 51 KB of JSON, 19.6 KB gzipped, and a hefty sheet. So
1 MiB holds about 50 versions of a Zahir-sized character, plus each distinct portrait once
(~18 KB). A simpler sheet is smaller.

## 3. Size

`src/data/remote/size.ts` computes a document's storage size by Firestore's published rules
(firebase.google.com/docs/firestore/storage-size), with no dependency:

- string: UTF-8 bytes + 1. Bytes: their length. Integer or double: 8. Boolean, null: 1.
- map: the sum of each key's string size and value size. Array: the sum of its values.
- **An empty map or array counts 1**, not the published 0. That is what the emulator measures.
- document: its name + its fields + 32. The name of `cloud/{uid}` is
  `("cloud" + 1) + (uid + 1) + 16`.

**Checked against the Firestore emulator** before this was written, by binary-searching the
largest accepted document:

- For every value type, the formula lands on exactly 1,048,576 bytes, with one exception: empty
  maps and arrays measure one byte more. Production is assumed to agree.
- A **single field** is capped earlier, at 1,048,487 bytes. That limit is separate, but it never
  binds here. The largest field is `characters`, nearly the whole document, and what the document
  must spend outside that value is at least 89 bytes: the name of `cloud/{uid}` with a one-character
  uid, `("cloud" 5 + 1) + (1 + 1) + 16` = 24; `layoutVersion: 2`, `(13 + 1) + 8` = 22; the key
  `characters`, `10 + 1` = 11; and the document's own 32 — with `portraits` absent, which is the
  smallest case. So `characters` is at most 1,048,576 − 89 = 1,048,487 bytes, exactly the cap:
  any document within the limit has every field within it too. (A real uid is 28 characters,
  which leaves 27 bytes more headroom.)

Used for three things: the usage line, each version's size on the cloud screen (its version map,
so a shared portrait is counted only in the total), and the quota message (§5). It is only ever
a display: Firestore enforces the limit, not this function. §9 tests that they agree at the
boundary.

## 4. Operations

**List.** `getDoc(cloud/{uid})`: one read, the whole document. It is parsed at its
`layoutVersion`:

- absent document: no backups, usage 0
- known version: the characters, newest version first, and the usage
- newer version than this build knows: "Your cloud backups were made by a newer version of the
  app. Reload to update." Nothing is written.
- malformed: a typed failure. The document is left untouched.

Each version is then decoded for display: gunzip → `JSON.parse` → `parseCharacter` →
`summarize()`, the same path restore takes and the same summary the local list shows.

- A card shows its newest version's name and level.
- A version whose sheet is damaged or too new is still listed, flagged with `describeLoadError`'s
  sentence, and can still be deleted. A damaged local character is treated the same way. This is
  better than layout 1, where such a sheet only failed on restore.
- Cost: 50 Zahir-sized sheets gunzip and `JSON.parse` in 19 ms under Node 24. Zod validation is
  on top, and a phone is slower. To be measured on the built screen, not assumed.

The decoded results are kept for as long as the screen shows them.

**Upload.** No read. One write:

```ts
setDoc(ref, { layoutVersion: 2, portraits: { [hash]: jpeg }, characters: { [id]: { [at]: entry } } },
       { merge: true })
```

- `merge` adds keys and leaves the others, so two devices uploading at once both keep their
  version. Map keys in `set` data are literal, dots included.
- **Without a portrait, the write has no `portraits` key at all.** Checked in the emulator:
  merging `portraits: {}` replaces the stored map with an empty one. It is a leaf in the merge's
  field mask, so every stored portrait would be wiped while the versions still pointed at them.
  The same holds for any empty map, so an upload never writes one.
- It also creates the document on a player's first upload.
- Rewriting a portrait that is already there is harmless: same key, same bytes.
- Over the limit, Firestore refuses the write (§5).

**Restore.** No download: it stores the version already decoded by List, with its portrait
looked up by key in the same copy. The copy cannot be wrong, because a version is never modified
after upload. If another device has deleted it since, what is restored is still a real version.
The conflict dialog and Replace / Keep both are unchanged (cloud-backup §4).

**Delete a version** / **delete a character.** One `runTransaction` (exported by
`firebase/firestore/lite`):

1. Read the document.
2. Remove `characters.{id}.{at}`, or `characters.{id}` when that was its last version or the whole
   character is being deleted. Keys are addressed as `FieldPath` segments, because they contain
   dots.
3. Remove every portrait no remaining version references.

The transaction is what keeps step 3 safe. If another device uploads a version using that
portrait in between, the commit fails on the changed document and the transaction retries with it.

No operation deletes the document itself.

## 5. Over the quota

Firestore refuses a write that would make the document larger than 1 MiB.

- **In the emulator** the refusal is `failed-precondition`, "maximum entity size is 1048576
  bytes". Production's code and wording are not documented, and may differ.
- **So the numbers decide, not the code.** `toCloudError` already turns an unrecognised code into
  `UNKNOWN`. When an upload fails with `UNKNOWN`, `CloudBackup.upload` reads the document and
  computes its size with the new version merged in, applying in memory the same merge the write
  would have made.
  - If that is over the limit, the failure is the new `CloudError('FULL')`, and the sentence is:
    "Not enough cloud space: this version needs 19.6 KB and 12.0 KB is free. Delete old versions
    on the Cloud screen to make room."
  - Otherwise it is the original `UNKNOWN`.
  - If that read fails too, the sentence is the original one.
- `QUOTA` keeps its meaning: the whole project's daily quota (`resource-exhausted`).
- A normal upload therefore costs one write and no download. Only a refused one reads.

## 6. Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /cloud/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow create, update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['layoutVersion', 'portraits', 'characters'])
        && request.resource.data.layoutVersion == 2
        && (resource == null || resource.data.layoutVersion == 2);
    }
  }
}
```

- **The last line refuses an old build.** A tab still running layout 2 after layout 3 ships could
  otherwise merge `layoutVersion: 2` into a layout-3 document. With the check, its write is
  refused and its update prompt is the way forward. Layout 3's rules will accept a `resource` at
  2 or 3, which is how a migration writes.
- **Nothing inside the maps is validated.** Firestore's size limit bounds the document whatever
  it contains, and the client validates it strictly on read.
- **No `delete`.** No operation needs one. The one-time wipe is done in the console.
- **`users/{uid}/**` is gone.** Layout 1 becomes unreachable.

## 7. Indexes

`firestore.indexes.json` exempts `portraits` and `characters` of collection `cloud` from
single-field indexing (`fieldOverrides` with empty `indexes`). A map's exemption covers every
field inside it.

- Nothing queries them.
- Each index entry is stored and counted apart from the document (up to 1,500 bytes of value
  each), so an indexed sheet costs storage twice.
- Firestore caps a document at 40,000 index entries.

`firebase.json` gains `"indexes": "firestore.indexes.json"`. `deploy.yml` deploys
`firestore:rules,firestore:indexes`. The deploy service account may need **Cloud Datastore Index
Admin** beside Firebase Rules Admin; the first run will say.

## 8. Layout versioning

**One migration walk for both formats.** `src/data/migration/` already holds the walk, beside
`schema/` rather than inside it: read the version, validate at it, migrate one step, repeat, and
validate at the current version. It becomes generic:

```ts
// src/data/migration/versioned.ts
export interface VersionedFormat {
  versionKey: string;                            // 'schemaVersion' | 'layoutVersion'
  current: number;
  schemas: Readonly<Record<number, z.ZodType>>;
  migrations: ReadonlyMap<number, Migration>;
}
export function parseVersioned<T>(raw: unknown, format: VersionedFormat): LoadResult<T>;
```

- **`parseCharacter` becomes a thin wrapper** over it, with `versionKey: 'schemaVersion'`. Its
  signature, its callers and its tests are unchanged. The synthetic three-version registry keeps
  covering the walk for both formats.
- **This is the first commit of the build:** a pure refactor, with the existing tests green
  before layout 2 uses it.
- **It stays in `src/data/`, not `src/shared/`.** Both users, `schema/` and `remote/`, are in the
  data layer. `shared/` may be imported by `business/` and `ui/`, which must never parse or
  migrate a stored format.
- **The `LoadError` codes are shared, but the sentences are not.** `describeLoadError` says
  "This file…". The cloud gets its own describe, e.g. "Your cloud backups were made by a newer
  version of the app. Reload to update."
- **Not shared: write-back or the IndexedDB upgrade.**
  - Each store writes a migrated document back its own way: IndexedDB compare-and-replace in one
    transaction, the cloud in a Firestore transaction.
  - `upgradeCharacterDb` changes the database's structure inside idb's versionchange
    transaction. It is not validate-then-migrate over data, and `DB_VERSION` stays untied from
    document versions.

**Layout files.**

- `src/data/remote/layout/v2.ts` owns layout 2's Zod schema. Each later version gets its own
  file.
- Nothing is shared between version files, for the reason `src/data/schema/README.md` gives: a
  primitive tightened for v3 would silently change what v2 accepts. A shipped version is never
  edited. The walk is machinery, not a schema, so sharing it does not breach this; every
  character version already shares it.
- `layout/index.ts` is the entry point: `CURRENT_LAYOUT` and the layout's `VersionedFormat`.
  - `schemas: { 2: layoutV2Schema }`. There is no layout 1 to parse: it was never a single
    document.
  - `migrations` is empty.
- **Layout 3** adds one migration and the write-back:
  - The write-back runs in a transaction, and only if the document still holds what was read,
    like the IndexedDB write-back.
  - A document that fails to migrate is reported and left as it is (the one promise).
- **Layout and schema are independent.** The layout versions the Firestore structure. Each sheet
  inside it carries its own `schemaVersion`. The same separation as `DB_VERSION` and
  `schemaVersion` (AGENTS.md).

## 9. Testing

Every test proven to bite, as AGENTS.md requires.

- **`versioned.test.ts`**: `versionKey` is honoured. A value carrying only `schemaVersion` is
  unversioned to a `layoutVersion` format, and the reverse. The rest of the walk stays covered
  by `parseCharacter.test.ts`.
- **`size.test.ts`**: each type's rule, and a nested map, against hand-computed sizes.
- **`layout/v2.test.ts`**: round-trip; unknown keys rejected at every level; a newer
  `layoutVersion` reported, not parsed.
- **`cloudBackup.test.ts`**, over the in-memory fake, updated for:
  - usage and limit
  - a damaged and a too-new sheet listed and flagged, not dropped
  - restore makes no repository call
  - portrait deduplication
  - a delete that orphans a portrait removes it, and one still shared keeps it
  - the quota message, with and without its numbers
- **`npm run test:rules`**: a Node script under `scripts/`, run by `firebase emulators:exec`
  against its own config and port, so it does not collide with a running `dev:cloud`. It uses
  the client SDK with `mockUserToken`, so there is no new dependency.
  - own document read and write allowed; another uid's refused; any other path refused
  - wrong `layoutVersion`, a downgrade of a layout-3 document, and an extra top-level field
    refused
  - **the size formula agrees with the emulator**: a document `size.ts` puts at exactly
    1,048,576 bytes is accepted, and one byte more is refused
  - a delete transaction racing an upload keeps the upload's version and its portrait

  Rule mutations are checked the way the spike did: remove each condition, and exactly the test
  that guards it must fail.
- **CI**: `deploy.yml` runs `test:rules` (with `actions/setup-java`) before deploying the rules.
- **End to end**: upload, usage line, restore, delete, in Chromium against `dev:cloud`.
  `scripts/seedEmulator.mjs` is rewritten for layout 2.

## 10. Accepted risks and ceilings

- **1 MiB is a hard ceiling.** It cannot be raised without a new layout. The upgrade path is
  many documents plus the verified counter (§1), reached by a layout migration.
- **Opening the cloud screen and each delete download the whole document**, up to 1 MiB, every
  time: Firestore lite has no cache. Typical use is far less.
  - Reads are billed per document, not per byte.
  - Spark's ~10 GiB/month network allowance, shared by all players, covers about 10,000 visits
    to a full document.
  - **Rejected alternative:** a separate small index document read on opening, with the data
    read only on restore. It would bring back the summary copy (§2) and an index that rules
    cannot check against the data, to save a download that is usually small.
- **Shared quota, unchanged.** Any Google account can write, so ~1,000 players at the limit fill
  Spark's 1 GiB. The allow-list upgrade path stands.
- **Sizes are computed by the published formula.** §9 checks it against the emulator at the
  limit. Production is assumed to agree.
- **Old builds are refused** until they reload. The update prompt already exists.

## 11. Changes to `2026-09-24-cloud-backup-design.md`

- §3, §4, §5: replaced by §2, §4 and §6 here.
- §6: `totalBytes` comes from §3 here, `limitBytes` is added, and `QUOTA` is added to the error
  list.
- §4: Restore no longer downloads anything: it uses the copy List decoded.
- §7: the header reads "Using 312.4 KB of 1 MB". Each version's size is its own map, so a shared
  portrait is counted once, in the total. A version with a damaged or too-new sheet is listed
  and flagged.
- §8: rules are tested by `test:rules`, not by hand. The one-line-rules exception is over.
- §10: the "~5,000 versions per character" and "each version stores its own portrait" ceilings
  are gone, replaced by §10 here.
- §11: portrait deduplication moves into scope.
- §12.3: obsolete, since there are no empty indexes.

## 12. Delivery order

1. On a branch, test-first:
   1. The migration walk made generic (§8), a pure refactor with the existing tests green.
   2. Then layout, size, repository, business layer, UI, rules, indexes and seed.
2. Merge. CI runs `test:rules`, then deploys hosting, rules and indexes.
3. **By hand, once, after the deploy:** in the console, delete the `users` collection (layout 1).
   Old builds already get `permission-denied` from the new rules, so the order is safe.

## 13. Deviations found while building

1. **"Full" is a sentence, not a code.** `describeFull` (§5) returns the finished sentence
   directly; there is no `CloudError('FULL')`. Nothing branches on "full" as a kind of failure —
   the caller only ever wants the message — so a code would have been a value nothing reads.
2. **Delete all versions now also removes versions uploaded elsewhere since the list was read.**
   `deleteCharacter` passes `uploadedAts: null` through to `withoutVersions`, which reads the
   document inside the same transaction rather than acting on the caller's stale listing, so it
   takes every version actually stored, not just the ones this browser knew about. This retires
   cloud-backup §10's fourth risk outright, rather than carrying it forward as still-accepted: the
   one-document layout made the whole-document read-modify-write the natural shape, where the old
   per-character index made the stale-listing risk the cheaper option.
3. **§9's "a delete transaction racing an upload" is tested deterministically**, as "a delete
   decides from what it reads, not from what the caller last listed"
   (`cloudStore.emulator.test.ts`, "a delete decides from what it reads..."): another client
   uploads a version between this one's last read and its delete, and the delete still keeps that
   version's portrait. A real race — two clients committing at the same instant — cannot be forced
   from a test, so this is the deterministic shape of the same guarantee. Firestore lite's retry on
   a changed document was confirmed separately, by a probe outside the test suite: forcing the
   transaction's document to change between its read and its commit made the transaction body run
   twice, the second time seeing the change.
4. **The usage line is stacked**, the value then "of 1.0 MB" beneath it, with no literal "Using" —
   matching the account row's existing value-over-caption layout on the same screen, rather than
   inventing a new one-line sentence just for this number. §11's "Using 312.4 KB of 1 MB" wording
   is superseded by this; `CloudScreen.tsx` renders `usedBytes` and `limitBytes` as two stacked
   spans, and `CloudScreen.test.tsx` asserts the "of 1.0 MB" text rather than a full sentence.
5. **Sign-out while a listing is still loading loses that listing, not the other way round.**
   `CloudBackup.#apply` compares the uid it is about to apply against the currently signed-in uid
   and drops its result if they differ, and `restore` refuses outright once signed out — so nothing
   of a signed-out account can be restored, even from a listing that was already in flight when
   sign-out happened. Known residual: another tab signing out does not clear this tab's list from
   the screen until this tab next checks. For a **sign-out** that is safe: every cloud call then
   rejects `SIGNED_OUT`, and restore refuses once a check has seen it.

   An **account switch** in another tab is different, because Firebase Auth syncs the new user
   into this tab while this tab's listing, and `#state.user`, still say the old one. What protects
   it is that every `CloudRepository` call takes the uid it acts for — `load(uid)`,
   `upload(uid, …)`, `deleteVersions(uid, …)` — and the store builds its document path from that
   argument, never from `auth.currentUser`. A delete from the stale listing therefore names the
   old account's document while the request carries the new account's token, and the rules refuse
   it with `permission-denied`: neither account's document is touched, and the player reads "The
   cloud refused this account…". Before this, the store read `auth.currentUser` at call time, so
   Delete all versions ran against the new account's document. Still residual: restore makes no
   cloud call, so until this tab checks again it can restore a version from the old account's
   listing into this browser — a copy this tab was already showing, not a write to either cloud.
6. **`scripts/seedEmulator.mjs` reads its emulator hosts from the environment**
   (`FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST`) rather than hardcoding
   `dev:cloud`'s 8080/9099, falling back to those only when the variables are absent. `firebase
   emulators:exec` sets them for its child process, so the same script runs unmodified against a
   scratch emulator on other ports — which is what let `test:rules`'s port-8181 emulator and
   `dev:cloud`'s stay independent without a second copy of the script.
7. **Emulator tests assert against what is actually stored**, not just a call's return value:
   `store.load()` after a delete, so a return value computed locally by `withoutVersions` can never
   paper over a store that failed to apply it. This caught two things a return-value-only test
   would have missed: a partial delete whose field path (an ISO timestamp) contains dots, which a
   `'.'`-joined path string would silently split and miss; and a newer-layout document, seeded
   through the emulator's admin REST API, proven byte-for-byte untouched by a delete this build
   cannot parse.
8. **The layout-version import fence was extended to `src/data/schema/` too.** `src/data/schema/`
   already had its own carve-out from the *schema*-version fence (it is the one place allowed to
   reach into `schema/v1/`), so it needed a separate, explicit exclusion to stay barred from
   reaching into `remote/layout/v2.ts` — the two isolations are unrelated and neither implies the
   other.
9. **CI deploys rules, then hosting, then indexes, as three steps** — not hosting then
   `firestore:rules,firestore:indexes` as §7 and §12 say. The new client works only against the
   new rules, so hosting first left a window in which the live app was refused by the old ones;
   and one combined step meant a missing "Cloud Datastore Index Admin" role failed the rules
   deploy too. Indexes are not needed for correctness, so they go last, on their own.
10. **A refused upload over a newer layout says to update.** Once layout 3 ships, §6's last rule
    refuses this build's uploads with `permission-denied`, whose sentence ("Sign out, sign in
    again…") cannot help. On `PERMISSION_DENIED`, `CloudBackup` therefore reads the document too,
    like §5 does for `UNKNOWN`: if it is `FROM_FUTURE`, the sentence is `describeLayoutError`'s
    "Reload to update"; otherwise, or if the read fails, the original.
11. **§5's size check also runs on `QUOTA`**, not only on `UNKNOWN`. If production answered an
    oversized write with `resource-exhausted`, a full cloud would otherwise read "out of free
    capacity for today". A real daily-quota failure makes the read fail too, so its sentence
    stands.
