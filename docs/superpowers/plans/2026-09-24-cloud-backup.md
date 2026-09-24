# Cloud Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upload a character to Firestore as a dated version, and list, restore and delete those versions, behind Google sign-in.

**Architecture:** `src/data/remote/` is the only code that imports `firebase`. It holds a pure codec (gzip and portrait bytes), a `CloudRepository` interface, and its Firestore implementation. `src/business/cloudBackup.ts` (`CloudBackup`) holds the observable cloud state and the actions, and it stores restored characters through a new `CharacterLibraryBO.restore`. `src/ui/` adds an Upload to cloud button on the sheet, a Cloud button on the list, a `#/cloud` screen and a conflict dialog.

**Tech Stack:** firebase 12.19.0 (`firebase/app`, `firebase/auth`, `firebase/firestore/lite`), MobX 7, React 19, Zod 4, Vitest 4, fake-indexeddb.

**Spec:** `docs/superpowers/specs/2026-09-24-cloud-backup-design.md`

## Global Constraints

- Firestore paths: `users/{uid}/characters/{characterId}` (index: `{ versions: { [uploadedAt]: entry } }`) and `users/{uid}/characters/{characterId}/payloads/{uploadedAt}` (`{ sheet: Bytes, portrait: Bytes | null }`).
- `uploadedAt` is `new Date().toISOString()`, e.g. `2026-09-24T18:03:12.345Z`.
- Rules: `match /users/{uid}/{document=**} { allow read, write: if request.auth != null && request.auth.uid == uid; }`. Nothing else is allowed.
- `authDomain: 'dnd-character-sheet-64a24.web.app'`, project `dnd-character-sheet-64a24`.
- Sign-in: `signInWithRedirect` in production. `signInWithPopup` under `import.meta.env.DEV`: localhost is not the `authDomain`'s origin, and a cross-origin redirect loses its result to storage partitioning.
- `firebase` may be imported only under `src/data/remote/`, enforced by ESLint.
- Firebase is loaded by dynamic `import()` on the first cloud action, never on launch.
- Nothing is ever deleted automatically. Every delete is confirmed with "This cannot be undone".
- The one promise: a cloud payload that will not parse is reported with a typed reason, never repaired or stored.
- Every cloud failure is returned as one sentence. Nothing thrown reaches React.
- Cloud failures never go to `StorageGate`.
- `npm test`, `npm run typecheck`, `npm run lint` and `npx prettier --check .` must pass before every commit.
- Commit messages use Conventional Commits and end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Work on branch `feature/cloud-backup`, which already exists and holds the spec commit.

## Deliberate deviations from the spec (record them in the spec, Task 7)

1. **The Firebase chunk is precached by the service worker.** `vite.config.ts` precaches `**/*.js`, so the lazily imported Firebase chunk is downloaded in the background when the app is installed. What the spec's promise still guarantees is that Firebase is never *executed* on launch. Keeping the chunk out of the precache would need rolldown chunk naming for no player-visible gain, since cloud features need the network anyway.
2. **The rules check is done in the console's Rules Playground**, not the local emulator, which needs Java. It is the same check (own uid allowed, another uid denied) with no extra install.
3. **An index document whose `versions` map is empty is hidden from the list.** This covers the race where another device deletes a version at the same moment. `deleteVersion` on the last version still deletes the whole character, as the spec says.

## Prerequisites (the user, in the Firebase console — before Task 3's live check)

- [ ] Firestore → Create database, in production mode. The location is permanent; `eur3` is suggested.
- [ ] Authentication → Sign-in method → enable **Google**.
- [ ] Authentication → Settings → Authorized domains: confirm `dnd-character-sheet-64a24.web.app` and `localhost`.
- [ ] Project settings → Your apps: if there is no Web app, add one (no Hosting setup). Keep its config for Task 3.
- [ ] IAM (console.cloud.google.com → IAM): give the GitHub deploy service account (`github-action-…@dnd-character-sheet-64a24.iam.gserviceaccount.com`) the role **Firebase Rules Admin**, so Task 7's CI step can deploy the rules.

## Review Focus

1. **An edit made less than 500 ms before Upload** must be in the uploaded version. `upload` flushes autosave first → test in Task 5.
2. **Restoring over a local copy that is damaged** must be offered as a conflict with "damaged" as the local time, and Replace must turn the row healthy in place → tests in Tasks 4 and 5.
3. **A redirect sign-in resumes the pending upload exactly once.** A reload after a failed resumed upload must not upload again → test in Task 5.
4. **Firebase fails to load** (offline and never cached, or blocked) → status `unavailable` and a sentence, never a rejection → test in Task 5.
5. **Upload pressed twice quickly** must upload once. The second press gets the busy sentence → test in Task 5.

---

## File map

| File | Responsibility |
|---|---|
| `src/data/remote/codec.ts` (+ test) | gzip JSON, portrait data URL ↔ bytes, `encodePayload`, `decodePayload` (runs `parseCharacter`) |
| `src/data/remote/types.ts` | `CloudUser`, `CloudVersion`, `CloudCharacter`, `Payload`, `CloudRepository` |
| `src/data/remote/cloudError.ts` (+ test) | `CloudError`, `toCloudError` (Firebase codes → ours), `describeCloudError` |
| `src/data/remote/config.ts` | Firebase web config |
| `src/data/remote/firestoreRepository.ts` | the Firestore/Auth implementation of `CloudRepository` |
| `firestore.rules`, `firebase.json` | rules, and wiring them into deploys |
| `eslint.config.js` | `firebase` restricted to `src/data/remote/` |
| `vite.config.ts` | service worker must not answer `/__/` navigations |
| `src/business/characterLibrary.ts` (+ test) | `isOpen(id)`, `restore(doc, portrait)` |
| `src/business/cloudBackup.ts` (+ test) | `CloudBackup` |
| `src/business/index.ts` | exports `CloudBackup` and its public types |
| `src/ui/route.ts` (+ test) | `{ name: 'cloud' }` ↔ `#/cloud` |
| `src/ui/types.ts`, `src/ui/bind.ts` | `CloudView`, `useCloud`, `useUploadNotice` |
| `src/ui/screens/CloudScreen.tsx` (+ test, + story) | the cloud screen and the conflict dialog |
| `src/ui/screens/HubGrid.tsx`, `CharacterHub.tsx`, `CharacterList.tsx` | the two new buttons |
| `src/ui/App.tsx`, `src/ui/App.test.tsx`, `src/main.tsx` | wiring |
| `.github/workflows/deploy.yml`, docs | rules deploy, spec/AGENTS/BACKLOG |

---

### Task 1: Codec

**Files:**
- Create: `src/data/remote/codec.ts`
- Test: `src/data/remote/codec.test.ts`

**Interfaces:**
- Consumes: `parseCharacter` (`src/data/migration/parseCharacter.ts`), `portraitSchema` (`src/data/repository/portrait.ts`), `LoadError`.
- Produces:
  - `interface Payload { sheet: Uint8Array; portrait: Uint8Array | null }`
  - `encodePayload(doc: CharacterDocument, portrait: string | null): Promise<Payload>`
  - `decodePayload(payload: Payload, assignId: string): Promise<DecodeResult>`
  - `type DecodeResult = { ok: true; doc: CharacterDocument; portrait: string | null } | { ok: false; kind: 'corrupt'; message: string } | { ok: false; kind: 'document'; error: LoadError }`
  - `portraitToBytes(dataUrl: string): Uint8Array`, `bytesToPortrait(bytes: Uint8Array): string`

`Payload` lives in `codec.ts`, and `types.ts` (Task 2) imports it from here.

- [ ] **Step 1: Write the failing tests**

```ts
// src/data/remote/codec.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ID_A, ID_B, docFor } from '../../test/fixtures.js';
import { bytesToPortrait, decodePayload, encodePayload, portraitToBytes } from './codec.js';

// A real exported character: 8 sessions of journal, so compression has something to do.
const zahir = (
  JSON.parse(
    readFileSync(new URL('../../../testAssets/zahir-ibn-talaar-2026-09-24.json', import.meta.url), 'utf8'),
  ) as { sheet: Parameters<typeof encodePayload>[0] }
).sheet;

// Smallest valid JPEG-shaped data URL the portrait rule accepts; the bytes need not be an image.
const PORTRAIT = `data:image/jpeg;base64,${btoa('\xff\xd8\xff\xe0 not really a jpeg \xff\xd9')}`;

describe('codec', () => {
  it('round-trips a real character, and compresses it', async () => {
    const payload = await encodePayload(zahir, null);
    expect(payload.sheet.byteLength).toBeLessThan(JSON.stringify(zahir).length / 2);

    const decoded = await decodePayload(payload, zahir.id);
    expect(decoded).toEqual({ ok: true, doc: zahir, portrait: null });
  });

  it('round-trips a portrait byte for byte', async () => {
    expect(bytesToPortrait(portraitToBytes(PORTRAIT))).toBe(PORTRAIT);
    const decoded = await decodePayload(await encodePayload(docFor(ID_A, 'Sable'), PORTRAIT), ID_A);
    expect(decoded.ok && decoded.portrait).toBe(PORTRAIT);
  });

  it('stores raw bytes, not base64: a third smaller', () => {
    expect(portraitToBytes(PORTRAIT).byteLength).toBe(atob(PORTRAIT.split(',')[1] ?? '').length);
  });

  it('assigns the id it is told to, so Keep both can restore as a copy', async () => {
    const decoded = await decodePayload(await encodePayload(docFor(ID_A, 'Sable'), null), ID_B);
    expect(decoded.ok && decoded.doc.id).toBe(ID_B);
  });

  it('reports bytes that are not gzip as corrupt', async () => {
    const decoded = await decodePayload({ sheet: new Uint8Array([1, 2, 3]), portrait: null }, ID_A);
    expect(decoded).toMatchObject({ ok: false, kind: 'corrupt' });
  });

  it('reports gzip that is not JSON as corrupt', async () => {
    const payload = await encodePayload(docFor(ID_A, 'Sable'), null);
    const notJson = new Uint8Array(
      await new Response(
        new Blob(['{ nope']).stream().pipeThrough(new CompressionStream('gzip')),
      ).arrayBuffer(),
    );
    expect(await decodePayload({ ...payload, sheet: notJson }, ID_A)).toMatchObject({
      ok: false,
      kind: 'corrupt',
    });
  });

  it('reports a document from a newer app as a load error, not as corrupt', async () => {
    const future = { ...docFor(ID_A, 'Sable'), schemaVersion: 99 };
    const decoded = await decodePayload(await encodePayload(future, null), ID_A);
    expect(decoded).toEqual({
      ok: false,
      kind: 'document',
      error: { code: 'FROM_FUTURE', found: 99, current: 1 },
    });
  });

  it('never repairs an invalid document', async () => {
    const padded = { ...docFor(ID_A, 'Sable'), name: ' Sable ' };
    const decoded = await decodePayload(await encodePayload(padded, null), ID_A);
    expect(decoded).toMatchObject({ ok: false, kind: 'document', error: { code: 'INVALID_AT_VERSION' } });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/data/remote/codec.test.ts`
Expected: FAIL, "Failed to resolve import ./codec.js".

- [ ] **Step 3: Implement**

```ts
// src/data/remote/codec.ts
import type { LoadError } from '../migration/errors.js';
import { parseCharacter } from '../migration/parseCharacter.js';
import { portraitSchema } from '../repository/portrait.js';
import type { CharacterDocument } from '../schema/index.js';

/**
 * A version's data as Firestore stores it, minus the `Bytes` wrapper — which is Firebase's, and
 * so is added and removed only in `firestoreRepository.ts`. Plain bytes keep this file free of
 * `firebase` and testable under Node.
 */
export interface Payload {
  /** `JSON.stringify(doc)`, gzipped. */
  sheet: Uint8Array;
  /** The JPEG itself, decoded from its data URL: a third smaller than the base64. */
  portrait: Uint8Array | null;
}

export type DecodeResult =
  | { ok: true; doc: CharacterDocument; portrait: string | null }
  /** The bytes are not gzip, the gzip is not JSON, or the portrait is not a JPEG. */
  | { ok: false; kind: 'corrupt'; message: string }
  /** Readable JSON that `parseCharacter` refused: the same taxonomy as a stored document. */
  | { ok: false; kind: 'document'; error: LoadError };

const JPEG_PREFIX = 'data:image/jpeg;base64,';

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function portraitToBytes(dataUrl: string): Uint8Array {
  return Uint8Array.from(atob(dataUrl.slice(JPEG_PREFIX.length)), (char) => char.charCodeAt(0));
}

/** A loop, not `String.fromCharCode(...bytes)`: spreading ~17 000 arguments is an engine limit. */
export function bytesToPortrait(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return JPEG_PREFIX + btoa(binary);
}

/** The browser's own `CompressionStream` — no dependency. Node 24 has it too, so this is tested. */
export async function encodePayload(
  doc: CharacterDocument,
  portrait: string | null,
): Promise<Payload> {
  const sheet = await drain(
    new Blob([JSON.stringify(doc)]).stream().pipeThrough(new CompressionStream('gzip')),
  );
  return { sheet, portrait: portrait === null ? null : portraitToBytes(portrait) };
}

/**
 * The cloud copy's way back in, through the same `parseCharacter` a stored document takes: it is
 * validated and migrated, and one that will not load is reported, never repaired (the one
 * promise). `assignId` is the id the restored character takes — its own, or a fresh one for
 * "Keep both".
 */
export async function decodePayload(payload: Payload, assignId: string): Promise<DecodeResult> {
  let raw: unknown;
  try {
    // Copied so the Blob gets an ArrayBuffer-backed view, whatever buffer Firestore handed back.
    const text = await new Response(
      new Blob([new Uint8Array(payload.sheet)]).stream().pipeThrough(new DecompressionStream('gzip')),
    ).text();
    raw = JSON.parse(text);
  } catch (caught) {
    return {
      ok: false,
      kind: 'corrupt',
      message: caught instanceof Error ? caught.message : String(caught),
    };
  }

  const parsed = parseCharacter(raw);
  if (!parsed.ok) return { ok: false, kind: 'document', error: parsed.error };

  const portrait = payload.portrait === null ? null : bytesToPortrait(payload.portrait);
  if (portrait !== null && !portraitSchema.safeParse(portrait).success) {
    return { ok: false, kind: 'corrupt', message: 'Its portrait is not a valid JPEG.' };
  }
  return { ok: true, doc: { ...parsed.doc, id: assignId }, portrait };
}
```

If `tsc` rejects a `Uint8Array` as a `BlobPart` (TypeScript 6's `Uint8Array<ArrayBufferLike>` versus `ArrayBuffer`), type `drain`'s result and `Payload`'s fields as `Uint8Array<ArrayBuffer>`. Verify against the installed TypeScript; don't guess.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/data/remote/codec.test.ts`
Expected: 8 passed.

- [ ] **Step 5: Prove the tests bite**

Temporarily change `decodePayload`'s last line to `{ ...parsed.doc, id: parsed.doc.id }`. Only "assigns the id it is told to" should fail. Temporarily return `{ ok: true, doc: raw as CharacterDocument, portrait }` before the `parseCharacter` check. The FROM_FUTURE and "never repairs" tests should fail. Restore both.

- [ ] **Step 6: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint && npx prettier --check .`

```bash
git add src/data/remote/codec.ts src/data/remote/codec.test.ts
git commit -m "feat(data): encode a character for the cloud, and decode it through parseCharacter"
```

---

### Task 2: Remote types and cloud errors

**Files:**
- Create: `src/data/remote/types.ts`, `src/data/remote/cloudError.ts`
- Test: `src/data/remote/cloudError.test.ts`

**Interfaces:**
- Consumes: `Payload` from Task 1.
- Produces:

```ts
// types.ts
export interface CloudUser { uid: string; name: string | null; email: string | null }
export interface CloudVersion {
  uploadedAt: string; name: string; classes: { name: string; level: number }[];
  totalLevel: number; sheetUpdatedAt: string; schemaVersion: number; bytes: number;
}
/** `versions` newest first, never empty. */
export interface CloudCharacter { characterId: string; versions: CloudVersion[] }
export interface CloudRepository { /* see Step 3 */ }
// cloudError.ts
export type CloudFailure = 'OFFLINE' | 'SIGNED_OUT' | 'PERMISSION_DENIED' | 'QUOTA' | 'CANCELLED' | 'NOT_FOUND' | 'UNKNOWN';
export class CloudError extends Error { readonly code: CloudFailure }
export function toCloudError(caught: unknown): CloudError;
export function describeCloudError(error: CloudError): string;
```

- [ ] **Step 1: Write the failing test**

```ts
// src/data/remote/cloudError.test.ts
import { describe, expect, it } from 'vitest';
import { CloudError, describeCloudError, toCloudError } from './cloudError.js';

/** Firebase errors are `FirebaseError`s with a string `code`; a plain object stands in for one. */
const firebaseError = (code: string) => Object.assign(new Error(code), { code });

describe('toCloudError', () => {
  it.each([
    ['unavailable', 'OFFLINE'],
    ['deadline-exceeded', 'OFFLINE'],
    ['auth/network-request-failed', 'OFFLINE'],
    ['permission-denied', 'PERMISSION_DENIED'],
    ['unauthenticated', 'PERMISSION_DENIED'],
    ['resource-exhausted', 'QUOTA'],
    ['auth/popup-closed-by-user', 'CANCELLED'],
    ['auth/cancelled-popup-request', 'CANCELLED'],
    ['not-found', 'NOT_FOUND'],
    ['internal', 'UNKNOWN'],
  ])('maps %s to %s', (code, expected) => {
    expect(toCloudError(firebaseError(code)).code).toBe(expected);
  });

  it('keeps a CloudError as it is', () => {
    const error = new CloudError('SIGNED_OUT');
    expect(toCloudError(error)).toBe(error);
  });

  it('keeps the original as the cause, so an UNKNOWN is still diagnosable', () => {
    const original = new TypeError('Failed to fetch dynamically imported module');
    expect(toCloudError(original)).toMatchObject({ code: 'UNKNOWN', cause: original });
  });

  it('has a sentence for every code', () => {
    for (const code of ['OFFLINE', 'SIGNED_OUT', 'PERMISSION_DENIED', 'QUOTA', 'CANCELLED', 'NOT_FOUND', 'UNKNOWN'] as const) {
      expect(describeCloudError(new CloudError(code))).toMatch(/\.$/);
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/data/remote/cloudError.test.ts`
Expected: FAIL, "Failed to resolve import ./cloudError.js".

- [ ] **Step 3: Implement both files**

```ts
// src/data/remote/types.ts
import type { Payload } from './codec.js';

export type { Payload };

export interface CloudUser {
  uid: string;
  name: string | null;
  email: string | null;
}

/**
 * One upload, as its entry in the character's index document. `uploadedAt` is the entry's map key
 * and the payload's document id; everything else is copied from the sheet at upload time, so the
 * cloud screen draws a row without downloading the payload.
 */
export interface CloudVersion {
  uploadedAt: string;
  name: string;
  classes: { name: string; level: number }[];
  /** `summarize()`'s value: the list's own number, not a new calculation. */
  totalLevel: number;
  /** The sheet's own `updatedAt` — what the conflict dialog compares, not the upload time. */
  sheetUpdatedAt: string;
  schemaVersion: number;
  /** Payload size, for the usage display. */
  bytes: number;
}

/** `versions` is newest first, and never empty: an emptied index is not listed. */
export interface CloudCharacter {
  characterId: string;
  versions: CloudVersion[];
}

/**
 * The cloud as the business layer sees it. The Firestore implementation is
 * `firestoreRepository.ts`; tests use an in-memory fake. Every method rejects with a
 * `CloudError`, never with a Firebase type.
 */
export interface CloudRepository {
  /** Resolves once Firebase knows who is signed in — including a redirect sign-in just returning. */
  currentUser(): Promise<CloudUser | null>;
  /** With a redirect this navigates away and never settles; with a popup it resolves. */
  signIn(): Promise<CloudUser>;
  signOut(): Promise<void>;
  listCharacters(): Promise<CloudCharacter[]>;
  /** One batch: the payload, and the version's key merged into the index. */
  upload(characterId: string, version: CloudVersion, payload: Payload): Promise<void>;
  /** `null` when that version is no longer in the cloud. */
  getPayload(characterId: string, uploadedAt: string): Promise<Payload | null>;
  /** One batch: the payload, and its key removed from the index. Not for the last version. */
  deleteVersion(characterId: string, uploadedAt: string): Promise<void>;
  /** Every payload named, then the index last — so a failure partway can be retried. */
  deleteCharacter(characterId: string, uploadedAts: readonly string[]): Promise<void>;
}
```

```ts
// src/data/remote/cloudError.ts
export type CloudFailure =
  | 'OFFLINE'
  | 'SIGNED_OUT'
  | 'PERMISSION_DENIED'
  | 'QUOTA'
  | 'CANCELLED'
  | 'NOT_FOUND'
  | 'UNKNOWN';

/** Every cloud failure, whichever Firebase product raised it, so no Firebase type escapes. */
export class CloudError extends Error {
  constructor(
    readonly code: CloudFailure,
    cause?: unknown,
  ) {
    super(code, { cause });
    this.name = 'CloudError';
  }
}

/** Firestore's and Auth's codes (checked against firebase@12.19.0's `FirestoreErrorCode`). */
const CODES: Readonly<Record<string, CloudFailure>> = {
  unavailable: 'OFFLINE',
  'deadline-exceeded': 'OFFLINE',
  'auth/network-request-failed': 'OFFLINE',
  'permission-denied': 'PERMISSION_DENIED',
  unauthenticated: 'PERMISSION_DENIED',
  'resource-exhausted': 'QUOTA',
  'auth/popup-closed-by-user': 'CANCELLED',
  'auth/cancelled-popup-request': 'CANCELLED',
  'not-found': 'NOT_FOUND',
};

/** Read structurally, so this file needs no `firebase` import and is tested under Node. */
export function toCloudError(caught: unknown): CloudError {
  if (caught instanceof CloudError) return caught;
  const code =
    typeof caught === 'object' && caught !== null && 'code' in caught ? caught.code : undefined;
  return new CloudError((typeof code === 'string' && CODES[code]) || 'UNKNOWN', caught);
}

export function describeCloudError(error: CloudError): string {
  switch (error.code) {
    case 'OFFLINE':
      return 'The cloud could not be reached. Check your connection and try again.';
    case 'SIGNED_OUT':
      return 'Sign in with Google to use cloud backup.';
    case 'PERMISSION_DENIED':
      return 'The cloud refused this account. Sign out, sign in again, and retry.';
    case 'QUOTA':
      return 'Cloud backup is out of free capacity for today. Try again tomorrow.';
    case 'CANCELLED':
      return 'Sign-in was cancelled.';
    case 'NOT_FOUND':
      return 'This version is no longer in the cloud.';
    case 'UNKNOWN':
      return 'Cloud backup failed unexpectedly. Try again.';
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/data/remote/cloudError.test.ts`
Expected: 13 passed.

- [ ] **Step 5: Prove it bites**

Remove the `'resource-exhausted'` row from `CODES`. Exactly one `it.each` case should fail. Restore it.

- [ ] **Step 6: Typecheck, lint, commit**

```bash
git add src/data/remote/types.ts src/data/remote/cloudError.ts src/data/remote/cloudError.test.ts
git commit -m "feat(data): the cloud repository interface and its error taxonomy"
```

---

### Task 3: Firestore repository, rules, lint boundary, service worker

**Files:**
- Modify: `package.json` (via `npm install`)
- Create: `src/data/remote/config.ts`, `src/data/remote/firestoreRepository.ts`, `firestore.rules`
- Modify: `firebase.json`, `eslint.config.js`, `vite.config.ts`

**Interfaces:**
- Consumes: `CloudRepository`, `CloudVersion`, `CloudCharacter`, `CloudUser` (Task 2); `Payload` (Task 1); `CloudError`, `toCloudError` (Task 2).
- Produces: `createFirestoreRepository(): CloudRepository` — the module Task 5 imports dynamically as `import('../data/remote/firestoreRepository.js')`.

There's no unit test for this file: it is the Firebase adapter, and everything above it is tested over a fake. It's verified by `tsc`, by the lint check proving it bites, and live in Task 7.

- [ ] **Step 1: Install**

Run: `npm install firebase@12.19.0`
Expected: `package.json` `dependencies` gains `"firebase": "^12.19.0"`.

- [ ] **Step 2: Get the web config**

Run: `npx firebase-tools apps:sdkconfig WEB --project dnd-character-sheet-64a24`

If it says there is no web app, the prerequisite step wasn't done. Stop and ask the user. If it isn't logged in, ask the user to run `npx firebase-tools login`. Copy `apiKey`, `appId` and `messagingSenderId` from the output into:

```ts
// src/data/remote/config.ts
/**
 * The Firebase web config. Public by design — it names the project, it does not authorise
 * anything; the rules in `firestore.rules` do. `authDomain` is the app's own origin, not
 * `firebaseapp.com`, so the sign-in redirect's `/__/auth/handler` is same-origin and survives
 * third-party storage partitioning.
 */
export const firebaseConfig = {
  apiKey: '<apiKey from the command output>',
  authDomain: 'dnd-character-sheet-64a24.web.app',
  projectId: 'dnd-character-sheet-64a24',
  messagingSenderId: '<messagingSenderId from the command output>',
  appId: '<appId from the command output>',
};
```

The three `<…>` values come from that command's output and nowhere else. Never commit this file with the angle-bracket text still in it.

- [ ] **Step 3: Implement the repository**

```ts
// src/data/remote/firestoreRepository.ts
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {
  Bytes,
  collection,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  getFirestore,
  writeBatch,
} from 'firebase/firestore/lite';
import { z } from 'zod';
import { CloudError, toCloudError } from './cloudError.js';
import { firebaseConfig } from './config.js';
import type { CloudCharacter, CloudRepository, CloudUser, CloudVersion, Payload } from './types.js';

/**
 * Not strict, unlike every schema in `src/data/schema/`: this is the app's own index, not a
 * character, and a newer build that adds a field must not make an older one's cloud screen fail.
 * Still validated, so a malformed entry fails the list loudly instead of rendering `undefined`.
 */
const entrySchema = z.object({
  name: z.string(),
  classes: z.array(z.object({ name: z.string(), level: z.number() })),
  totalLevel: z.number(),
  sheetUpdatedAt: z.string(),
  schemaVersion: z.number(),
  bytes: z.number(),
});
const indexSchema = z.object({ versions: z.record(z.string(), entrySchema) });

/** Batches cap at 500 writes. */
const BATCH = 500;

/**
 * Lite Firestore: plain get/set, no realtime listeners, no offline cache — the cloud is only
 * touched on a button press. Every call goes through `guard`, so what escapes is a `CloudError`.
 */
export function createFirestoreRepository(): CloudRepository {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  // A redirect sign-in completes here, on the load after it. Its failure is not this call's to
  // report: `currentUser` below still answers — with nobody — and the player can try again.
  const ready = getRedirectResult(auth)
    .catch(() => null)
    .then(() => auth.authStateReady());

  const toUser = (user: User): CloudUser => ({
    uid: user.uid,
    name: user.displayName,
    email: user.email,
  });
  const uid = (): string => {
    const user = auth.currentUser;
    if (user === null) throw new CloudError('SIGNED_OUT');
    return user.uid;
  };
  const indexRef = (characterId: string) => doc(db, 'users', uid(), 'characters', characterId);
  const payloadRef = (characterId: string, uploadedAt: string) =>
    doc(db, 'users', uid(), 'characters', characterId, 'payloads', uploadedAt);

  async function guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (caught) {
      throw toCloudError(caught);
    }
  }

  return {
    currentUser: () =>
      guard(async () => {
        await ready;
        return auth.currentUser === null ? null : toUser(auth.currentUser);
      }),

    signIn: () =>
      guard(async () => {
        const provider = new GoogleAuthProvider();
        // Popup in dev: localhost is not `authDomain`'s origin, and a cross-origin redirect loses
        // its result to storage partitioning. In production the redirect is same-origin.
        if (import.meta.env.DEV) return toUser((await signInWithPopup(auth, provider)).user);
        return signInWithRedirect(auth, provider);
      }),

    signOut: () => guard(() => signOut(auth)),

    listCharacters: () =>
      guard(async () => {
        const snapshot = await getDocs(collection(db, 'users', uid(), 'characters'));
        const characters: CloudCharacter[] = snapshot.docs.map((row) => ({
          characterId: row.id,
          versions: Object.entries(indexSchema.parse(row.data()).versions)
            .map(([uploadedAt, entry]): CloudVersion => ({ uploadedAt, ...entry }))
            // ISO 8601 with milliseconds sorts lexically in time order.
            .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
        }));
        // An emptied index: another device deleted a version at the same moment. Nothing to show.
        return characters.filter((character) => character.versions.length > 0);
      }),

    upload: (characterId, { uploadedAt, ...entry }, payload) =>
      guard(() =>
        writeBatch(db)
          .set(payloadRef(characterId, uploadedAt), {
            sheet: Bytes.fromUint8Array(payload.sheet),
            portrait: payload.portrait === null ? null : Bytes.fromUint8Array(payload.portrait),
          })
          // `merge`: adds this one key and leaves the others, so two devices uploading at once
          // both keep their version. Map keys in `set` data are literal, dots included.
          .set(indexRef(characterId), { versions: { [uploadedAt]: entry } }, { merge: true })
          .commit(),
      ),

    getPayload: (characterId, uploadedAt) =>
      guard(async () => {
        const snapshot = await getDoc(payloadRef(characterId, uploadedAt));
        if (!snapshot.exists()) return null;
        const { sheet, portrait } = snapshot.data();
        if (!(sheet instanceof Bytes)) throw new CloudError('UNKNOWN', 'payload has no sheet bytes');
        return {
          sheet: sheet.toUint8Array(),
          portrait: portrait instanceof Bytes ? portrait.toUint8Array() : null,
        } satisfies Payload;
      }),

    deleteVersion: (characterId, uploadedAt) =>
      guard(() =>
        writeBatch(db)
          .delete(payloadRef(characterId, uploadedAt))
          // A `FieldPath`, not the string `versions.${uploadedAt}`: the key contains dots, which a
          // string path would read as nesting.
          .update(indexRef(characterId), new FieldPath('versions', uploadedAt), deleteField())
          .commit(),
      ),

    deleteCharacter: (characterId, uploadedAts) =>
      guard(async () => {
        for (let start = 0; start < uploadedAts.length; start += BATCH) {
          const batch = writeBatch(db);
          for (const uploadedAt of uploadedAts.slice(start, start + BATCH)) {
            batch.delete(payloadRef(characterId, uploadedAt));
          }
          await batch.commit();
        }
        // Last, so a failure above leaves the index naming what is still there, and a retry —
        // deleting an absent payload succeeds — finishes the job.
        await writeBatch(db).delete(indexRef(characterId)).commit();
      }),
  };
}
```

- [ ] **Step 4: Rules and `firebase.json`**

```
// firestore.rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // A player's own tree, and nothing else. Everything outside it is denied by default.
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

In `firebase.json`, add a top-level key beside `"hosting"`:

```json
  "firestore": { "rules": "firestore.rules" },
```

- [ ] **Step 5: Restrict `firebase` to `src/data/remote/` in ESLint**

In `eslint.config.js`, add after `SCHEMA_VERSION_PATTERN`:

```js
/**
 * `firebase` is imported by `src/data/remote/` and nowhere else, so the SDK — and the network —
 * cannot creep into the business layer or a component. Added to every other fileset's single
 * `no-restricted-imports` call rather than as a separate entry: see the replace-not-merge trap
 * documented on `boundary` above.
 */
const FIREBASE_PATTERN = {
  group: ['firebase', 'firebase/*', '@firebase/*'],
  message: 'Only src/data/remote may import firebase (see docs/superpowers/specs/2026-09-24-cloud-backup-design.md §2).',
};
```

Then replace the five `boundary(...)` calls with:

```js
  boundary('shared', ['data', 'business', 'ui'], { extra: [FIREBASE_PATTERN] }),
  boundary('data', ['business', 'ui'], {
    ignores: ['src/data/schema/**/*.ts', 'src/data/remote/**/*.ts'],
    extra: [SCHEMA_VERSION_PATTERN, FIREBASE_PATTERN],
  }),
  // src/data/schema/ is the one place allowed to reach into a version directory, so it is
  // split out of the `data` boundary above instead of inheriting the schema-version pattern.
  boundary('data/schema', ['business', 'ui'], { extra: [FIREBASE_PATTERN] }),
  // src/data/remote/ is the one place allowed to import firebase — split out for the same reason.
  boundary('data/remote', ['business', 'ui'], { extra: [SCHEMA_VERSION_PATTERN] }),
  boundary('business', ['ui'], { extra: [SCHEMA_VERSION_PATTERN, FIREBASE_PATTERN] }),
  // `ui` may import `business` and `shared` only (spec §2) — reaching past the business layer
  // into `data` is a violation, so `data` must be listed here. An empty forbidden list would
  // leave this boundary restricting nothing at all.
  boundary('ui', ['data'], { extra: [SCHEMA_VERSION_PATTERN, FIREBASE_PATTERN] }),
```

- [ ] **Step 6: Prove the lint rule bites, in every layer**

For each of `src/business/createId.ts`, `src/ui/route.ts`, `src/data/repository/summarize.ts` and `src/shared/slug.ts` (check that last path with `ls src/shared`), add `import 'firebase/app';` at the top and run `npm run lint`.
Expected: one `Only src/data/remote may import firebase` error per file. Also check that `npx eslint src/data/remote` reports no error. Remove all four lines and run `npm run lint`, which should now be clean.

- [ ] **Step 7: Keep the service worker away from `/__/`**

`dist/sw.js` currently registers `NavigationRoute(createHandlerBoundToURL("index.html"))` for every navigation. That would answer the redirect's `/__/auth/handler` with the app's own `index.html`, and sign-in would never complete. In `vite.config.ts`, change the `workbox` line to:

```ts
      // `/__/` is Firebase Hosting's reserved path; the sign-in redirect lands on
      // `/__/auth/handler`, which must reach the network, not the cached app shell.
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        navigateFallbackDenylist: [/^\/__\//],
      },
```

Run: `npm run build && grep -o "NavigationRoute[^;]\{0,160\}" dist/sw.js`
Expected: the output contains `denylist:[/^\/__\//]`. Also record the size of the Firebase chunk the build prints; Task 7 writes it into AGENTS.md.

- [ ] **Step 8: Typecheck, test, commit**

Run: `npm run typecheck && npm test && npm run lint && npx prettier --check .`

```bash
git add package.json package-lock.json src/data/remote/config.ts src/data/remote/firestoreRepository.ts firestore.rules firebase.json eslint.config.js vite.config.ts
git commit -m "feat(data): Firestore cloud repository, owner-only rules, and firebase confined to data/remote"
```

---

### Task 4: `CharacterLibraryBO.isOpen` and `restore`

**Files:**
- Modify: `src/business/characterLibrary.ts`
- Test: `src/business/characterLibrary.test.ts` (append a `describe`)

**Interfaces:**
- Produces, both internal and absent from `index.ts`:
  - `isOpen(id: string): boolean`
  - `restore(doc: CharacterDocument, portrait: string | null): Promise<void>`: stores under `doc.id`, refreshing that row in place if it exists and adding it if not. Throws `Error` if that character's sheet is open.

- [ ] **Step 1: Write the failing tests** (append to `characterLibrary.test.ts`; it already imports `ID_A`, `ID_B`, `docFor`, `putRaw`)

```ts
describe('CharacterLibraryBO restore', () => {
  let repository: CharacterRepository;

  beforeEach(async () => {
    await wipe();
    repository = createIndexedDbRepository({ openDb: createOpener() });
  });
  afterEach(wipe);

  it('adds a character that is not here, under its own id', async () => {
    const library = libraryOver(repository);
    await library.load();

    await library.restore(docFor(ID_A, 'Sable'), null);

    expect(library.entries.map((entry) => [entry.id, entry.name])).toEqual([[ID_A, 'Sable']]);
    expect((await repository.get(ID_A))?.ok).toBe(true);
  });

  it('replaces a damaged row in place, and it stops being damaged', async () => {
    await putRaw(ID_A, { not: 'a character' });
    const library = libraryOver(repository);
    await library.load();
    const entry = library.entries[0];
    expect(entry?.isDamaged).toBe(true);

    await library.restore(docFor(ID_A, 'Sable'), null);

    // Same object: the raw-JSON screen keys an effect on entry identity.
    expect(library.entries).toEqual([entry]);
    expect(entry?.isDamaged).toBe(false);
    expect(entry?.name).toBe('Sable');
  });

  it('stores the portrait with the document', async () => {
    const portrait = `data:image/jpeg;base64,${btoa('jpeg')}`;
    const library = libraryOver(repository);
    await library.restore(docFor(ID_A, 'Sable'), portrait);
    expect(await repository.getPortrait(ID_A)).toBe(portrait);
    expect(library.entries[0]?.portrait).toBe(portrait);
  });

  it('knows which characters have an open sheet', async () => {
    await repository.save(docFor(ID_A, 'Sable'));
    const library = libraryOver(repository);
    await library.load();
    const opened = await library.entries[0]!.open();
    if (!opened.ok) throw new Error(opened.message);

    expect(library.isOpen(ID_A)).toBe(true);
    expect(library.isOpen(ID_B)).toBe(false);
    opened.sheet.dispose();
    expect(library.isOpen(ID_A)).toBe(false);
  });

  it('refuses to replace a character whose sheet is open, which would autosave over it', async () => {
    await repository.save(docFor(ID_A, 'Sable'));
    const library = libraryOver(repository);
    await library.load();
    const opened = await library.entries[0]!.open();
    if (!opened.ok) throw new Error(opened.message);

    await expect(library.restore(docFor(ID_A, 'Restored'), null)).rejects.toThrow(/open/);
    opened.sheet.dispose();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/business/characterLibrary.test.ts`
Expected: FAIL, `library.restore is not a function`.

- [ ] **Step 3: Implement**

In `CharacterLibraryBO`, add the field beside `#autosaves`:

```ts
  /** Every sheet handed out and not yet disposed, so a restore can refuse to replace one. */
  readonly #openSheets = new Set<CharacterSheetBO>();
```

In `attachAutosave`, add `this.#openSheets.add(sheet);` after `this.#autosaves.add(autosave);`, and `this.#openSheets.delete(sheet);` inside the `sheet.onDispose` callback.

Add after `store`:

```ts
  /** Internal, for `CloudBackup`: whether a sheet for this character is open right now. */
  isOpen(id: string): boolean {
    return [...this.#openSheets].some((sheet) => sheet.id === id);
  }

  /**
   * Internal, for `CloudBackup`: stores a restored character under its own id. A row that is
   * already there — healthy or damaged — is refreshed in place rather than replaced, for the
   * same identity reason as `#refreshRow`; one that is not is added.
   *
   * Throws while that character's sheet is open: its autosave would write the old copy straight
   * back over the restored one. `CloudBackup` checks first; this is the backstop.
   */
  async restore(doc: CharacterDocument, portrait: string | null): Promise<void> {
    if (this.isOpen(doc.id)) throw new Error(`character ${doc.id} is open; close it before replacing it`);
    const entry = this.#entries.find((candidate) => candidate.id === doc.id);
    if (entry === undefined) return this.store(doc, portrait);
    await this.#repository.save(doc, portrait);
    entry.refresh({ ok: true, summary: summarize(doc, portrait) });
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/business/characterLibrary.test.ts`
Expected: all pass, including the 5 new tests.

- [ ] **Step 5: Prove it bites**

Remove `this.#openSheets.delete(sheet);`. Only "knows which characters have an open sheet" should fail. Replace `entry.refresh(...)` with `this.#entries.remove(entry); await this.store(doc, portrait);`. Only the "in place" test should fail. Restore both.

- [ ] **Step 6: Commit**

```bash
git add src/business/characterLibrary.ts src/business/characterLibrary.test.ts
git commit -m "feat(business): restore a character under its own id, refusing one whose sheet is open"
```

---

### Task 5: `CloudBackup`

**Files:**
- Create: `src/business/cloudBackup.ts`
- Test: `src/business/cloudBackup.test.ts`
- Modify: `src/business/index.ts`

**Interfaces:**
- Consumes: `CloudRepository`, `CloudCharacter`, `CloudVersion`, `CloudUser` (Task 2); `encodePayload`, `decodePayload` (Task 1); `toCloudError`, `describeCloudError` (Task 2); `CharacterLibraryBO.repository`, `.flush()`, `.entries`, `.isOpen()`, `.restore()` (Task 4); `summarize`; `describeLoadError`; `StorageError`; `describeStorageFailure` (`src/business/errors.ts`); `CURRENT` (`src/data/schema/index.ts`); `createId`.
- Produces (exported from `index.ts`):

```ts
export type CloudStatus = 'signedOut' | 'signingIn' | 'signedIn' | 'unavailable';
export type UploadResult = { ok: true; uploadedAt: string } | { ok: false; message: string };
export type RestoreChoice = 'replace' | 'keepBoth';
export type RestoreResult =
  | { ok: true; id: string }
  | { ok: false; kind: 'failed'; message: string }
  | { ok: false; kind: 'conflict'; name: string; localUpdatedAt: string | null; cloudUpdatedAt: string };
export class CloudBackup {
  constructor(library: CharacterLibraryBO, options?: CloudBackupOptions);
  readonly schemaVersion: number;              // CURRENT, for "made by a newer version"
  get status(): CloudStatus; get user(): CloudUser | null; get characters(): CloudCharacter[];
  get busy(): boolean; get totalBytes(): number;
  get lastUpload(): { characterId: string; result: UploadResult } | null;
  resume(): Promise<void>;
  refresh(): Promise<string | null>;
  signIn(): Promise<string | null>;
  signOut(): Promise<string | null>;
  upload(characterId: string): Promise<UploadResult>;
  restore(characterId: string, uploadedAt: string, choice?: RestoreChoice): Promise<RestoreResult>;
  deleteVersion(characterId: string, uploadedAt: string): Promise<string | null>;
  deleteCharacter(characterId: string): Promise<string | null>;
}
```

The `string | null` returns follow `entry.clone()` and `entry.repair()`: `null` is success, and a string is the sentence to show.

- [ ] **Step 1: Write the failing tests**

```ts
// src/business/cloudBackup.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CloudError } from '../data/remote/cloudError.js';
import { decodePayload, type Payload } from '../data/remote/codec.js';
import { createIndexedDbRepository } from '../data/repository/indexedDbRepository.js';
import type { CloudCharacter, CloudRepository, CloudUser, CloudVersion } from '../data/remote/types.js';
import type { CharacterRepository } from '../data/repository/types.js';
import { ID_A, createOpener, docFor, putRaw, wipe } from '../test/fixtures.js';
import { CharacterLibraryBO } from './characterLibrary.js';
import { CloudBackup } from './cloudBackup.js';
import { StorageGate } from './storageGate.js';

const USER: CloudUser = { uid: 'u1', name: 'Ja', email: 'ja@example.com' };

/**
 * An in-memory cloud with the real one's semantics: a batch lands whole or not at all, and a
 * delete of an absent payload succeeds. `failNext` makes the next call reject, as Firestore would.
 */
function fakeCloud(signedIn = true) {
  const index = new Map<string, Map<string, CloudVersion>>();
  const payloads = new Map<string, Payload>();
  const state = {
    user: signedIn ? USER : null,
    failNext: null as CloudError | null,
    uploads: 0,
    signIns: 0,
  };
  const check = () => {
    const failure = state.failNext;
    state.failNext = null;
    if (failure) throw failure;
    if (state.user === null) throw new CloudError('SIGNED_OUT');
  };
  const key = (characterId: string, uploadedAt: string) => `${characterId}/${uploadedAt}`;

  const repository: CloudRepository = {
    currentUser: async () => state.user,
    signIn: async () => {
      state.signIns += 1;
      const failure = state.failNext;
      state.failNext = null;
      if (failure) throw failure;
      state.user = USER;
      return USER;
    },
    signOut: async () => {
      state.user = null;
    },
    listCharacters: async (): Promise<CloudCharacter[]> => {
      check();
      return [...index].map(([characterId, versions]) => ({
        characterId,
        versions: [...versions.values()].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
      }));
    },
    upload: async (characterId, version, payload) => {
      check();
      state.uploads += 1;
      payloads.set(key(characterId, version.uploadedAt), payload);
      const versions = index.get(characterId) ?? new Map<string, CloudVersion>();
      versions.set(version.uploadedAt, version);
      index.set(characterId, versions);
    },
    getPayload: async (characterId, uploadedAt) => {
      check();
      return payloads.get(key(characterId, uploadedAt)) ?? null;
    },
    deleteVersion: async (characterId, uploadedAt) => {
      check();
      payloads.delete(key(characterId, uploadedAt));
      index.get(characterId)?.delete(uploadedAt);
    },
    deleteCharacter: async (characterId, uploadedAts) => {
      check();
      for (const uploadedAt of uploadedAts) payloads.delete(key(characterId, uploadedAt));
      index.delete(characterId);
    },
  };
  return { repository, state, index, payloads };
}

/** Advances a millisecond per call, so two uploads never share an `uploadedAt`. */
function clock(start = Date.parse('2026-09-24T18:00:00.000Z')) {
  let now = start;
  return () => new Date(now++);
}

function memorySession() {
  const values = new Map<string, string>();
  return {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => void values.set(k, v),
    removeItem: (k: string) => void values.delete(k),
  };
}

describe('CloudBackup', () => {
  let repository: CharacterRepository;
  let library: CharacterLibraryBO;

  beforeEach(async () => {
    await wipe();
    repository = createIndexedDbRepository({ openDb: createOpener() });
    library = new CharacterLibraryBO({
      repository,
      storageGate: new StorageGate({ port: null }),
      // A debounce long enough that only `flush()` can land an edit before the upload reads it.
      autosave: { debounceMs: 60_000, target: null },
    });
    await repository.save(docFor(ID_A, 'Sable'));
    await library.load();
  });
  afterEach(wipe);

  function backup(cloud = fakeCloud(), session = memorySession()) {
    return {
      cloud,
      session,
      backup: new CloudBackup(library, {
        load: async () => cloud.repository,
        session,
        now: clock(),
      }),
    };
  }

  it('loads nothing on construction or on a resume with nothing pending', async () => {
    let loads = 0;
    const cloudBackup = new CloudBackup(library, {
      load: async () => {
        loads += 1;
        return fakeCloud().repository;
      },
      session: memorySession(),
    });
    await cloudBackup.resume();
    expect(loads).toBe(0);
    expect(cloudBackup.status).toBe('signedOut');
  });

  it('uploads one version: one index entry and one payload', async () => {
    const { backup: cloudBackup, cloud } = backup();

    const result = await cloudBackup.upload(ID_A);

    expect(result).toEqual({ ok: true, uploadedAt: '2026-09-24T18:00:00.000Z' });
    expect(cloud.index.get(ID_A)?.size).toBe(1);
    expect(cloud.payloads.size).toBe(1);
    expect(cloudBackup.characters).toEqual([
      {
        characterId: ID_A,
        versions: [
          expect.objectContaining({ name: 'Sable', totalLevel: 0, schemaVersion: 1 }) as unknown,
        ],
      },
    ]);
    expect(cloudBackup.lastUpload).toEqual({ characterId: ID_A, result });
  });

  it('uploads the edit made a moment ago, not the last autosaved copy', async () => {
    const opened = await library.entries[0]!.open();
    if (!opened.ok) throw new Error(opened.message);
    opened.sheet.setName('Sable Nightwind'); // inside the 60 s debounce: not yet stored
    const { backup: cloudBackup, cloud } = backup();

    await cloudBackup.upload(ID_A);

    const payload = [...cloud.payloads.values()][0]!;
    const decoded = await decodePayload(payload, ID_A);
    expect(decoded.ok && decoded.doc.name).toBe('Sable Nightwind');
    opened.sheet.dispose();
  });

  it('uploads once when Upload is pressed twice quickly', async () => {
    const { backup: cloudBackup, cloud } = backup();

    const [first, second] = await Promise.all([cloudBackup.upload(ID_A), cloudBackup.upload(ID_A)]);

    expect(cloud.state.uploads).toBe(1);
    expect(first.ok).toBe(true);
    expect(second).toEqual({ ok: false, message: 'Wait for the current cloud action to finish.' });
  });

  it('refuses to upload a damaged character', async () => {
    await putRaw(ID_A, { not: 'a character' });
    const { backup: cloudBackup, cloud } = backup();
    const result = await cloudBackup.upload(ID_A);
    expect(result.ok).toBe(false);
    expect(cloud.state.uploads).toBe(0);
  });

  it('signs in first when signed out, then uploads, and clears the pending marker', async () => {
    const { backup: cloudBackup, cloud, session } = backup(fakeCloud(false));

    const result = await cloudBackup.upload(ID_A);

    expect(cloud.state.signIns).toBe(1);
    expect(result.ok).toBe(true);
    expect(cloudBackup.status).toBe('signedIn');
    expect(session.getItem('dnd-character-sheet.cloud-pending-upload')).toBeNull();
  });

  it('resumes an upload that a redirect sign-in interrupted, exactly once', async () => {
    const cloud = fakeCloud(true); // the redirect came back signed in
    const session = memorySession();
    session.setItem('dnd-character-sheet.cloud-pending-upload', ID_A);
    cloud.state.failNext = new CloudError('OFFLINE');
    const first = new CloudBackup(library, { load: async () => cloud.repository, session, now: clock() });

    await first.resume();
    expect(first.lastUpload?.result.ok).toBe(false); // it tried, and failed, once

    const second = new CloudBackup(library, { load: async () => cloud.repository, session, now: clock() });
    await second.resume(); // a reload after the failure
    expect(cloud.state.uploads).toBe(0);
    expect(second.lastUpload).toBeNull();
  });

  it('reports a Firebase that will not load as unavailable, without rejecting', async () => {
    const cloudBackup = new CloudBackup(library, {
      load: () => Promise.reject(new TypeError('Failed to fetch dynamically imported module')),
      session: memorySession(),
    });

    await expect(cloudBackup.refresh()).resolves.toBe(
      'Cloud backup could not be loaded. Check your connection and try again.',
    );
    expect(cloudBackup.status).toBe('unavailable');
    await expect(cloudBackup.upload(ID_A)).resolves.toMatchObject({ ok: false });
  });

  it('turns a quota failure into a sentence', async () => {
    const { backup: cloudBackup, cloud } = backup();
    await cloudBackup.refresh();
    cloud.state.failNext = new CloudError('QUOTA');
    expect(await cloudBackup.upload(ID_A)).toEqual({
      ok: false,
      message: 'Cloud backup is out of free capacity for today. Try again tomorrow.',
    });
  });

  it('restores into an empty browser under the same id, with no dialog', async () => {
    const { backup: cloudBackup } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    await library.entries[0]!.remove();

    expect(await cloudBackup.restore(ID_A, uploadedAt)).toEqual({ ok: true, id: ID_A });
    expect(library.entries.map((entry) => entry.id)).toEqual([ID_A]);
  });

  it('asks when the character is already here, then Replace keeps the id', async () => {
    const { backup: cloudBackup } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };

    const asked = await cloudBackup.restore(ID_A, uploadedAt);
    expect(asked).toEqual({
      ok: false,
      kind: 'conflict',
      name: 'Sable',
      localUpdatedAt: '2026-07-25T09:41:00.000Z',
      cloudUpdatedAt: '2026-07-25T09:41:00.000Z',
    });

    expect(await cloudBackup.restore(ID_A, uploadedAt, 'replace')).toEqual({ ok: true, id: ID_A });
    expect(library.entries).toHaveLength(1);
  });

  it('Keep both stores a copy under a new id', async () => {
    const { backup: cloudBackup } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };

    const result = await cloudBackup.restore(ID_A, uploadedAt, 'keepBoth');

    expect(result.ok && result.id).not.toBe(ID_A);
    expect(library.entries).toHaveLength(2);
  });

  it('offers to replace a damaged local copy, and shows it as damaged', async () => {
    const { backup: cloudBackup } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    await putRaw(ID_A, { not: 'a character' });
    await library.load();

    expect(await cloudBackup.restore(ID_A, uploadedAt)).toMatchObject({
      kind: 'conflict',
      localUpdatedAt: null,
    });
    await cloudBackup.restore(ID_A, uploadedAt, 'replace');
    expect(library.entries[0]?.isDamaged).toBe(false);
  });

  it('refuses Replace while the sheet is open', async () => {
    const { backup: cloudBackup } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    const opened = await library.entries[0]!.open();
    if (!opened.ok) throw new Error(opened.message);

    expect(await cloudBackup.restore(ID_A, uploadedAt, 'replace')).toEqual({
      ok: false,
      kind: 'failed',
      message: "Close this character's sheet before replacing it.",
    });
    opened.sheet.dispose();
  });

  it('reports a version from a newer app and stores nothing', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    const { encodePayload } = await import('../data/remote/codec.js');
    cloud.payloads.set(
      `${ID_A}/${uploadedAt}`,
      await encodePayload({ ...docFor(ID_A, 'Future'), schemaVersion: 99 }, null),
    );
    await library.entries[0]!.remove();

    const result = await cloudBackup.restore(ID_A, uploadedAt);

    expect(result).toMatchObject({ ok: false, kind: 'failed', message: expect.stringMatching(/newer version/) as unknown });
    expect(library.entries).toEqual([]);
  });

  it('deleting the last version removes the character from the cloud', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const { uploadedAt } = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };

    expect(await cloudBackup.deleteVersion(ID_A, uploadedAt)).toBeNull();

    expect(cloud.index.has(ID_A)).toBe(false);
    expect(cloud.payloads.size).toBe(0);
    expect(cloudBackup.characters).toEqual([]);
  });

  it('deleting one of several versions keeps the others', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const first = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    await cloudBackup.upload(ID_A);

    await cloudBackup.deleteVersion(ID_A, first.uploadedAt);

    expect(cloud.index.get(ID_A)?.size).toBe(1);
    expect(cloudBackup.characters[0]?.versions).toHaveLength(1);
  });

  it('a character delete that fails can be retried, and keeps its row until it succeeds', async () => {
    const { backup: cloudBackup, cloud } = backup();
    await cloudBackup.upload(ID_A);
    await cloudBackup.upload(ID_A);
    cloud.state.failNext = new CloudError('OFFLINE');

    expect(await cloudBackup.deleteCharacter(ID_A)).toMatch(/connection/);
    expect(cloudBackup.characters).toHaveLength(1);

    expect(await cloudBackup.deleteCharacter(ID_A)).toBeNull();
    expect(cloudBackup.characters).toEqual([]);
    expect(cloud.payloads.size).toBe(0);
  });

  it('adds up the usage', async () => {
    const { backup: cloudBackup } = backup();
    await cloudBackup.upload(ID_A);
    await cloudBackup.upload(ID_A);
    const sizes = cloudBackup.characters[0]!.versions.map((version) => version.bytes);
    expect(cloudBackup.totalBytes).toBe(sizes[0]! + sizes[1]!);
  });

  it('signing out forgets the list, so the next person at this device does not see it', async () => {
    const { backup: cloudBackup } = backup();
    await cloudBackup.upload(ID_A);

    await cloudBackup.signOut();

    expect(cloudBackup.status).toBe('signedOut');
    expect(cloudBackup.user).toBeNull();
    expect(cloudBackup.characters).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/business/cloudBackup.test.ts`
Expected: FAIL, "Failed to resolve import ./cloudBackup.js".

- [ ] **Step 3: Implement**

```ts
// src/business/cloudBackup.ts
import { observable } from 'mobx';
import { describeLoadError } from '../data/migration/errors.js';
import { CloudError, describeCloudError, toCloudError } from '../data/remote/cloudError.js';
import { decodePayload, encodePayload } from '../data/remote/codec.js';
import type { CloudCharacter, CloudRepository, CloudUser, CloudVersion } from '../data/remote/types.js';
import { StorageError } from '../data/repository/storageFailure.js';
import { summarize } from '../data/repository/summarize.js';
import { CURRENT } from '../data/schema/index.js';
import type { CharacterLibraryBO } from './characterLibrary.js';
import { createId } from './createId.js';
import { describeStorageFailure } from './errors.js';
import './mobxConfig.js';

export type { CloudCharacter, CloudUser, CloudVersion };

export type CloudStatus = 'signedOut' | 'signingIn' | 'signedIn' | 'unavailable';
export type UploadResult = { ok: true; uploadedAt: string } | { ok: false; message: string };
export type RestoreChoice = 'replace' | 'keepBoth';
export type RestoreResult =
  | { ok: true; id: string }
  | { ok: false; kind: 'failed'; message: string }
  | {
      ok: false;
      kind: 'conflict';
      name: string;
      /** `null` when the local copy is damaged and has no readable `updatedAt`. */
      localUpdatedAt: string | null;
      cloudUpdatedAt: string;
    };

type Session = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface CloudBackupOptions {
  /** Defaults to a dynamic import, so Firebase is never executed before a cloud action. */
  load?: () => Promise<CloudRepository>;
  /** Where a pending upload survives the sign-in redirect. `null` turns that off. */
  session?: Session | null;
  now?: () => Date;
}

/** The character id whose upload a redirect sign-in interrupted. */
const PENDING_KEY = 'dnd-character-sheet.cloud-pending-upload';
const BUSY = 'Wait for the current cloud action to finish.';
const UNAVAILABLE = 'Cloud backup could not be loaded. Check your connection and try again.';

const loadFirestore = async (): Promise<CloudRepository> =>
  (await import('../data/remote/firestoreRepository.js')).createFirestoreRepository();

function defaultSession(): Session | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Optional cloud backup: dated versions of a character in Firestore, behind Google sign-in.
 *
 * A bare noun like `StorageGate`, for the same reason: it wraps no `*Data`. Its state is the
 * signed-in user and a copy of the cloud's index, neither of which is a slice of a character.
 *
 * Nothing here throws to its caller. Every action answers with a sentence or `null`, because a
 * rejected promise from a button press is a failure nobody sees.
 */
export class CloudBackup {
  /** The schema this build understands, so the screen can flag a version from a newer app. */
  readonly schemaVersion = CURRENT;

  readonly #library: CharacterLibraryBO;
  readonly #load: () => Promise<CloudRepository>;
  readonly #session: Session | null;
  readonly #now: () => Date;
  #repository: Promise<CloudRepository> | null = null;
  readonly #state = observable(
    {
      status: 'signedOut' as CloudStatus,
      user: null as CloudUser | null,
      characters: [] as CloudCharacter[],
      busy: false,
      lastUpload: null as { characterId: string; result: UploadResult } | null,
    },
    {},
    { deep: false },
  );

  constructor(library: CharacterLibraryBO, options: CloudBackupOptions = {}) {
    this.#library = library;
    this.#load = options.load ?? loadFirestore;
    this.#session = options.session === undefined ? defaultSession() : options.session;
    this.#now = options.now ?? (() => new Date());
  }

  get status(): CloudStatus {
    return this.#state.status;
  }
  get user(): CloudUser | null {
    return this.#state.user;
  }
  /** Newest version first within each character. */
  get characters(): CloudCharacter[] {
    return this.#state.characters;
  }
  get busy(): boolean {
    return this.#state.busy;
  }
  get totalBytes(): number {
    return this.#state.characters
      .flatMap((character) => character.versions)
      .reduce((total, version) => total + version.bytes, 0);
  }
  /** The last upload's outcome, for the sheet that asked for it — including a resumed one. */
  get lastUpload(): { characterId: string; result: UploadResult } | null {
    return this.#state.lastUpload;
  }

  /**
   * Called once at startup. Loads nothing unless a redirect sign-in is coming back with an upload
   * it interrupted. The marker is cleared before anything can fail, so a reload after a failed
   * resume does not upload again: the player sees the failure and presses Upload themselves.
   */
  async resume(): Promise<void> {
    const pending = this.#read(PENDING_KEY);
    if (pending === null) return;
    this.#write(PENDING_KEY, null);
    if ((await this.#signedInUser()) !== null) await this.upload(pending);
  }

  /** Signed in: re-reads the index. Signed out: only settles `status`. */
  async refresh(): Promise<string | null> {
    const user = await this.#signedInUser();
    if (user === null) return this.#state.status === 'unavailable' ? UNAVAILABLE : null;
    return this.#run(async (repository) => {
      this.#state.characters = await repository.listCharacters();
    });
  }

  async signIn(): Promise<string | null> {
    const repository = await this.#repo();
    if (repository === null) return UNAVAILABLE;
    this.#state.status = 'signingIn';
    try {
      // With a redirect the page navigates away inside this await, and nothing below runs.
      this.#state.user = await repository.signIn();
      this.#state.status = 'signedIn';
    } catch (caught) {
      this.#state.status = 'signedOut';
      return describeCloudError(toCloudError(caught));
    }
    return this.refresh();
  }

  async signOut(): Promise<string | null> {
    const repository = await this.#repo();
    if (repository === null) return UNAVAILABLE;
    try {
      await repository.signOut();
    } catch (caught) {
      return describeCloudError(toCloudError(caught));
    }
    // Forgotten at once: the next person at this device must not see this account's characters.
    this.#state.user = null;
    this.#state.characters = [];
    this.#state.status = 'signedOut';
    return null;
  }

  /**
   * Uploads what is stored for this character as a new version, flushing autosave first so the
   * last half second of typing is in it. Signed out, it signs in first; with a redirect, the
   * upload is resumed by `resume()` on the load after.
   */
  async upload(characterId: string): Promise<UploadResult> {
    if (this.#state.busy) return { ok: false, message: BUSY };
    this.#state.busy = true; // taken before any await, so a second press sees it
    let result: UploadResult;
    try {
      result = await this.#upload(characterId);
    } finally {
      this.#state.busy = false;
    }
    this.#state.lastUpload = { characterId, result };
    return result;
  }

  async #upload(characterId: string): Promise<UploadResult> {
    let user = await this.#signedInUser();
    if (user === null) {
      if (this.#state.status === 'unavailable') return { ok: false, message: UNAVAILABLE };
      this.#write(PENDING_KEY, characterId);
      const failed = await this.#signInOnly();
      this.#write(PENDING_KEY, null);
      if (failed !== null) return { ok: false, message: failed };
      user = this.#state.user;
    }
    const repository = await this.#repo();
    if (repository === null || user === null) return { ok: false, message: UNAVAILABLE };

    try {
      await this.#library.flush();
      const stored = await this.#library.repository.get(characterId);
      if (stored === null) return { ok: false, message: 'This character is no longer in this browser.' };
      if (!stored.ok) {
        return {
          ok: false,
          message: `Repair this character before uploading it. ${describeLoadError(stored.error)}`,
        };
      }
      const portrait = await this.#library.repository.getPortrait(characterId);
      const payload = await encodePayload(stored.doc, portrait);
      const { name, classes, totalLevel } = summarize(stored.doc, null);
      const version: CloudVersion = {
        uploadedAt: this.#now().toISOString(),
        name,
        classes,
        totalLevel,
        sheetUpdatedAt: stored.doc.updatedAt,
        schemaVersion: stored.doc.schemaVersion,
        bytes: payload.sheet.byteLength + (payload.portrait?.byteLength ?? 0),
      };
      await repository.upload(characterId, version, payload);
      this.#addVersion(characterId, version);
      return { ok: true, uploadedAt: version.uploadedAt };
    } catch (caught) {
      return { ok: false, message: this.#describe(caught) };
    }
  }

  /**
   * Without `choice`, a character already in this browser comes back as a conflict for the player
   * to settle. `replace` keeps the id and overwrites; `keepBoth` restores a copy under a new id.
   */
  async restore(
    characterId: string,
    uploadedAt: string,
    choice?: RestoreChoice,
  ): Promise<RestoreResult> {
    const failed = (message: string): RestoreResult => ({ ok: false, kind: 'failed', message });
    const version = this.#state.characters
      .find((character) => character.characterId === characterId)
      ?.versions.find((candidate) => candidate.uploadedAt === uploadedAt);
    if (version === undefined) return failed(describeCloudError(new CloudError('NOT_FOUND')));

    const local = this.#library.entries.find((entry) => entry.id === characterId);
    if (local !== undefined && choice === undefined) {
      const stored = await this.#library.repository.get(characterId);
      return {
        ok: false,
        kind: 'conflict',
        name: local.name,
        localUpdatedAt: stored?.ok ? stored.doc.updatedAt : null,
        cloudUpdatedAt: version.sheetUpdatedAt,
      };
    }
    const keepId = local === undefined || choice === 'replace';
    if (keepId && this.#library.isOpen(characterId)) {
      return failed("Close this character's sheet before replacing it.");
    }

    let id: string | null = null;
    const message = await this.#run(async (repository) => {
      const payload = await repository.getPayload(characterId, uploadedAt);
      if (payload === null) throw new CloudError('NOT_FOUND');
      const decoded = await decodePayload(payload, keepId ? characterId : createId());
      if (!decoded.ok) {
        throw new Error(
          decoded.kind === 'document'
            ? describeLoadError(decoded.error)
            : `This cloud version is damaged. ${decoded.message}`,
          { cause: RESTORE_REFUSED },
        );
      }
      await this.#library.restore(decoded.doc, decoded.portrait);
      id = decoded.doc.id;
    });
    return message === null && id !== null ? { ok: true, id } : failed(message ?? UNAVAILABLE);
  }

  deleteVersion(characterId: string, uploadedAt: string): Promise<string | null> {
    return this.#run(async (repository) => {
      const character = this.#state.characters.find((c) => c.characterId === characterId);
      if (character === undefined) return;
      // The last version takes the index with it: an empty index is a character with nothing to
      // restore, and would cost a read on every list for ever.
      if (character.versions.length === 1) await repository.deleteCharacter(characterId, [uploadedAt]);
      else await repository.deleteVersion(characterId, uploadedAt);
      this.#state.characters = this.#state.characters
        .map((c) =>
          c.characterId === characterId
            ? { ...c, versions: c.versions.filter((v) => v.uploadedAt !== uploadedAt) }
            : c,
        )
        .filter((c) => c.versions.length > 0);
    });
  }

  deleteCharacter(characterId: string): Promise<string | null> {
    return this.#run(async (repository) => {
      const character = this.#state.characters.find((c) => c.characterId === characterId);
      if (character === undefined) return;
      await repository.deleteCharacter(
        characterId,
        character.versions.map((version) => version.uploadedAt),
      );
      this.#state.characters = this.#state.characters.filter((c) => c.characterId !== characterId);
    });
  }

  /** Runs one cloud action under the busy flag, as a sentence or `null`. */
  async #run(action: (repository: CloudRepository) => Promise<void>): Promise<string | null> {
    if (this.#state.busy) return BUSY;
    this.#state.busy = true;
    try {
      const repository = await this.#repo();
      if (repository === null) return UNAVAILABLE;
      await action(repository);
      return null;
    } catch (caught) {
      return this.#describe(caught);
    } finally {
      this.#state.busy = false;
    }
  }

  /** `signIn` without its trailing `refresh`, which `#run` would refuse while an upload is busy. */
  async #signInOnly(): Promise<string | null> {
    const repository = await this.#repo();
    if (repository === null) return UNAVAILABLE;
    this.#state.status = 'signingIn';
    try {
      this.#state.user = await repository.signIn();
      this.#state.status = 'signedIn';
      return null;
    } catch (caught) {
      this.#state.status = 'signedOut';
      return describeCloudError(toCloudError(caught));
    }
  }

  #describe(caught: unknown): string {
    if (caught instanceof Error && caught.cause === RESTORE_REFUSED) return caught.message;
    if (caught instanceof StorageError) return describeStorageFailure(caught.detail);
    return describeCloudError(toCloudError(caught));
  }

  /** Loads Firebase once. A failed load is forgotten, so the next press tries again. */
  async #repo(): Promise<CloudRepository | null> {
    this.#repository ??= this.#load();
    try {
      return await this.#repository;
    } catch {
      this.#repository = null;
      this.#state.status = 'unavailable';
      return null;
    }
  }

  async #signedInUser(): Promise<CloudUser | null> {
    const repository = await this.#repo();
    if (repository === null) return null;
    try {
      const user = await repository.currentUser();
      this.#state.user = user;
      this.#state.status = user === null ? 'signedOut' : 'signedIn';
      return user;
    } catch {
      this.#state.status = 'unavailable';
      return null;
    }
  }

  /** Inserted locally rather than re-listed: a re-list costs a read per character. */
  #addVersion(characterId: string, version: CloudVersion): void {
    const others = this.#state.characters.filter((c) => c.characterId !== characterId);
    const existing = this.#state.characters.find((c) => c.characterId === characterId);
    this.#state.characters = [
      { characterId, versions: [version, ...(existing?.versions ?? [])] },
      ...others,
    ];
  }

  #read(key: string): string | null {
    try {
      return this.#session?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  #write(key: string, value: string | null): void {
    try {
      if (value === null) this.#session?.removeItem(key);
      else this.#session?.setItem(key, value);
    } catch {
      /* a browser that will not remember the marker just does not resume; nothing is lost */
    }
  }
}

/** Marks a restore refused on content — its message is already the sentence to show. */
const RESTORE_REFUSED = Symbol('restore refused');
```

`RESTORE_REFUSED` is declared at the bottom but used inside methods that only run after the module has loaded, so there's no temporal-dead-zone problem. If lint objects (`no-use-before-define`), move it above the class.

In `src/business/index.ts`, append:

```ts
// Optional cloud backup (docs/superpowers/specs/2026-09-24-cloud-backup-design.md). The
// Firestore repository is absent for the same reason `Autosave` is: it is a `src/data/` type.
export {
  CloudBackup,
  type CloudCharacter,
  type CloudStatus,
  type CloudUser,
  type CloudVersion,
  type RestoreChoice,
  type RestoreResult,
  type UploadResult,
} from './cloudBackup.js';
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run src/business/cloudBackup.test.ts`
Expected: 20 passed.

- [ ] **Step 5: Prove the Review Focus tests bite**

Run each change separately, watch only the named test fail, then restore:
- Delete `await this.#library.flush();` → "uploads the edit made a moment ago" fails.
- Move `this.#state.busy = true;` in `upload` to after `await this.#signedInUser()` inside `#upload` → "uploads once when Upload is pressed twice" fails.
- Move `this.#write(PENDING_KEY, null);` in `resume` to after the `upload` → "resumes … exactly once" fails.
- Replace `#repo`'s `catch` body with `throw` → "reports a Firebase that will not load" fails.
- Make the conflict branch return `localUpdatedAt: stored?.ok ? stored.doc.updatedAt : ''` → "offers to replace a damaged local copy" fails.

- [ ] **Step 6: Full check and commit**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`

```bash
git add src/business/cloudBackup.ts src/business/cloudBackup.test.ts src/business/index.ts
git commit -m "feat(business): CloudBackup — upload, list, restore and delete cloud versions"
```

---

### Task 6: The screens

**Files:**
- Modify: `src/ui/route.ts`, `src/ui/route.test.ts`, `src/ui/types.ts`, `src/ui/bind.ts`, `src/ui/screens/HubGrid.tsx`, `src/ui/screens/CharacterHub.tsx`, `src/ui/screens/CharacterList.tsx`, `src/ui/App.tsx`, `src/ui/App.test.tsx`, `src/main.tsx`
- Create: `src/ui/screens/CloudScreen.tsx`, `src/ui/screens/CloudScreen.test.tsx`, `src/ui/screens/CloudScreen.stories.tsx`

**Interfaces:**
- Consumes: `CloudBackup`, `RestoreChoice`, `RestoreResult` (Task 5), through `../business/index.js` only.
- Produces:
  - `Route` gains `{ name: 'cloud' }`, with hash `#/cloud`.
  - `CloudView`, `CloudCharacterView`, `CloudVersionView`, `ConflictView` in `src/ui/types.ts`.
  - `useCloud(cloud): CloudView` and `useUploadNotice(cloud, characterId): string | null` in `bind.ts`.
  - `CloudScreen` and the formatters `formatWhen`, `formatBytes`.

- [ ] **Step 1: Route — failing test first**

Append to `src/ui/route.test.ts`:

```ts
describe('the cloud route', () => {
  it('reads and writes #/cloud', () => {
    expect(parseRoute('#/cloud')).toEqual({ name: 'cloud' });
    expect(routeHash({ name: 'cloud' })).toBe('#/cloud');
  });
});
```

Run `npx vitest run src/ui/route.test.ts` and expect FAIL. Then in `route.ts`, add `| { name: 'cloud' }` to `Route`. In `parseRoute`, add `if (parts[0] === 'cloud') return { name: 'cloud' };` as the first line after `parts` is computed. In `routeHash`, add `if (route.name === 'cloud') return '#/cloud';` as the second line. Update the doc comment's "three screens" to "four screens". Run again and expect PASS.

- [ ] **Step 2: View types**

Append to `src/ui/types.ts`:

```ts
/** One upload of a character, as the cloud screen shows it. Times are ISO strings. */
export interface CloudVersionView {
  uploadedAt: string;
  sheetUpdatedAt: string;
  name: string;
  level: number;
  bytes: number;
  /** Written by a newer app than this one: restoring it will be refused, so it says so. */
  fromNewerApp: boolean;
}

export interface CloudCharacterView {
  characterId: string;
  /** The newest version's name and level. */
  name: string;
  level: number;
  versions: CloudVersionView[];
}

export interface CloudView {
  status: 'signedOut' | 'signingIn' | 'signedIn' | 'unavailable';
  user: { name: string | null; email: string | null } | null;
  characters: CloudCharacterView[];
  totalBytes: number;
  busy: boolean;
}

/** The Replace / Keep both question. `localUpdatedAt` is null when the local copy is damaged. */
export interface ConflictView {
  name: string;
  localUpdatedAt: string | null;
  cloudUpdatedAt: string;
}
```

- [ ] **Step 3: Bind**

In `src/ui/bind.ts`, add `type CloudBackup` to the `../business/index.js` import and `CloudView` to the `./types.js` import. Append:

```ts
export function toCloudView(cloud: CloudBackup): CloudView {
  return {
    status: cloud.status,
    user: cloud.user && { name: cloud.user.name, email: cloud.user.email },
    characters: cloud.characters.flatMap(({ characterId, versions }) => {
      const newest = versions[0];
      if (newest === undefined) return [];
      return [
        {
          characterId,
          name: newest.name,
          level: newest.totalLevel,
          versions: versions.map((version) => ({
            uploadedAt: version.uploadedAt,
            sheetUpdatedAt: version.sheetUpdatedAt,
            name: version.name,
            level: version.totalLevel,
            bytes: version.bytes,
            fromNewerApp: version.schemaVersion > cloud.schemaVersion,
          })),
        },
      ];
    }),
    totalBytes: cloud.totalBytes,
    busy: cloud.busy,
  };
}

export function useCloud(cloud: CloudBackup): CloudView {
  return useObserved(useCallback(() => toCloudView(cloud), [cloud]));
}

/**
 * The sheet's line under its Upload button: the outcome of the last upload *of this character*,
 * including one resumed after a sign-in redirect. The time is formatted by the screen.
 */
export function useUploadNotice(
  cloud: CloudBackup,
  characterId: string,
): { ok: true; uploadedAt: string } | { ok: false; message: string } | null {
  return useObserved(
    useCallback(() => {
      const last = cloud.lastUpload;
      return last !== null && last.characterId === characterId ? last.result : null;
    }, [cloud, characterId]),
  );
}
```

- [ ] **Step 4: Cloud screen — failing test first**

```tsx
// src/ui/screens/CloudScreen.test.tsx
// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { stubDialogElement } from '../../test/stubDialog.js';
import type { CloudView } from '../types.js';
import { CloudScreen } from './CloudScreen.js';

beforeAll(stubDialogElement);

const signedIn: CloudView = {
  status: 'signedIn',
  user: { name: 'Ja', email: 'ja@example.com' },
  totalBytes: 3_400_000,
  busy: false,
  characters: [
    {
      characterId: 'c1',
      name: 'Zahir',
      level: 5,
      versions: [
        { uploadedAt: '2026-09-30T20:11:05.002Z', sheetUpdatedAt: '2026-09-30T20:10:00.000Z', name: 'Zahir', level: 5, bytes: 40_000, fromNewerApp: false },
        { uploadedAt: '2026-09-24T18:03:12.345Z', sheetUpdatedAt: '2026-09-24T17:58:40.120Z', name: 'Zahir', level: 4, bytes: 38_000, fromNewerApp: true },
      ],
    },
  ],
};

function renderScreen(view: CloudView, overrides: Partial<Parameters<typeof CloudScreen>[0]> = {}) {
  const props = {
    view,
    message: null,
    conflict: null,
    onBack: vi.fn(),
    onSignIn: vi.fn(),
    onSignOut: vi.fn(),
    onRestore: vi.fn(),
    onDeleteVersion: vi.fn(),
    onDeleteCharacter: vi.fn(),
    onResolveConflict: vi.fn(),
    ...overrides,
  };
  render(<CloudScreen {...props} />);
  return props;
}

describe('CloudScreen', () => {
  it('signed out, offers only Google sign-in', () => {
    const props = renderScreen({ ...signedIn, status: 'signedOut', user: null, characters: [] });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    expect(props.onSignIn).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull();
  });

  it('shows the account and the usage', () => {
    renderScreen(signedIn);
    expect(screen.getByText(/ja@example\.com/)).toBeTruthy();
    expect(screen.getByText(/Using 3\.4 MB/)).toBeTruthy();
  });

  it('restores the version whose button was pressed', () => {
    const props = renderScreen(signedIn);
    fireEvent.click(screen.getAllByRole('button', { name: 'Restore' })[0]!);
    expect(props.onRestore).toHaveBeenCalledWith('c1', '2026-09-30T20:11:05.002Z');
  });

  it('flags a version from a newer app', () => {
    renderScreen(signedIn);
    expect(screen.getByText(/newer version of the app/)).toBeTruthy();
  });

  it('deletes a version only after confirming', () => {
    const props = renderScreen(signedIn);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[0]!);
    expect(props.onDeleteVersion).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(props.onDeleteVersion).toHaveBeenCalledWith('c1', '2026-09-30T20:11:05.002Z');
  });

  it('asks Replace or Keep both, says which copy is older, and answers', () => {
    const props = renderScreen(signedIn, {
      conflict: { name: 'Zahir', localUpdatedAt: '2026-09-30T20:10:00.000Z', cloudUpdatedAt: '2026-09-24T17:58:40.120Z' },
    });
    expect(screen.getByText(/Zahir is already in this browser/)).toBeTruthy();
    expect(screen.getByText(/The cloud version is older/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Keep both' }));
    expect(props.onResolveConflict).toHaveBeenCalledWith('keepBoth');
  });

  it('calls a damaged local copy damaged', () => {
    renderScreen(signedIn, {
      conflict: { name: 'Zahir', localUpdatedAt: null, cloudUpdatedAt: '2026-09-24T17:58:40.120Z' },
    });
    expect(screen.getByText(/This browser's copy: damaged/)).toBeTruthy();
  });
});
```

The "deletes a version only after confirming" test clicks the row's Delete, which opens `ConfirmDelete`'s dialog, and then clicks the dialog's Delete. If `getByRole('button', { name: 'Delete' })` finds more than one after the dialog opens, select it with `within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' })`. Check `ConfirmDelete.test.tsx` and copy how it does this.

Run `npx vitest run src/ui/screens/CloudScreen.test.tsx` and expect FAIL (module not found).

- [ ] **Step 5: Implement the cloud screen**

```tsx
// src/ui/screens/CloudScreen.tsx
import { ConfirmDelete } from '../components/ConfirmDelete.js';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import type { CloudView, ConflictView } from '../types.js';

interface Props {
  view: CloudView;
  /** The last action's sentence, or null. */
  message: string | null;
  conflict: ConflictView | null;
  onBack(): void;
  onSignIn(): void;
  onSignOut(): void;
  onRestore(characterId: string, uploadedAt: string): void;
  onDeleteVersion(characterId: string, uploadedAt: string): void;
  onDeleteCharacter(characterId: string): void;
  /** `null` is Cancel. */
  onResolveConflict(choice: 'replace' | 'keepBoth' | null): void;
}

/** "24 Sep, 18:03", in the player's own locale and timezone. */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatBytes(bytes: number): string {
  return bytes < 1_000_000 ? `${(bytes / 1000).toFixed(1)} KB` : `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function CloudScreen({
  view,
  message,
  conflict,
  onBack,
  onSignIn,
  onSignOut,
  onRestore,
  onDeleteVersion,
  onDeleteCharacter,
  onResolveConflict,
}: Props) {
  const signedIn = view.status === 'signedIn';

  return (
    <div className="app">
      <div className="lhead">
        <div className="vtop">
          <button type="button" className="txtbtn" onClick={onBack}>
            {'‹'} Characters
          </button>
          <h1>Cloud</h1>
          {signedIn && (
            <button type="button" className="txtbtn" style={{ marginLeft: 'auto' }} onClick={onSignOut}>
              Sign out
            </button>
          )}
        </div>
        {signedIn && view.user !== null && (
          <div className="sub">
            Signed in as {view.user.email ?? view.user.name} {'·'} Using {formatBytes(view.totalBytes)}
          </div>
        )}
      </div>

      {message !== null && (
        <div className="fieldError" role="alert">
          {message}
        </div>
      )}

      {!signedIn ? (
        <div className="empty">
          <p>Back up characters to your Google account, and restore them on any device.</p>
          <button
            type="button"
            className="newcat"
            disabled={view.status === 'signingIn'}
            onClick={onSignIn}
          >
            Sign in with Google
          </button>
        </div>
      ) : (
        <ul className="llist">
          {view.characters.length === 0 && (
            <li className="empty">Nothing uploaded yet. Open a character and tap Upload to cloud.</li>
          )}
          {view.characters.map((character) => (
            <li key={character.characterId}>
              <div className="ccard">
                <span className="cn">{character.name}</span>
                <span className="cc">
                  Level {character.level} {'·'} {character.versions.length}{' '}
                  {character.versions.length === 1 ? 'version' : 'versions'}
                </span>
              </div>
              <ul>
                {character.versions.map((version) => (
                  <li key={version.uploadedAt} className="sv">
                    <span>
                      Uploaded {formatWhen(version.uploadedAt)} {'·'} edited{' '}
                      {formatWhen(version.sheetUpdatedAt)} {'·'} {formatBytes(version.bytes)}
                      {version.fromNewerApp && ' · made by a newer version of the app'}
                    </span>
                    <button
                      type="button"
                      className="txtbtn"
                      disabled={view.busy}
                      onClick={() => onRestore(character.characterId, version.uploadedAt)}
                    >
                      Restore
                    </button>
                    <ConfirmDelete
                      what={`The version uploaded ${formatWhen(version.uploadedAt)}`}
                      onConfirm={() => onDeleteVersion(character.characterId, version.uploadedAt)}
                    >
                      Delete
                    </ConfirmDelete>
                  </li>
                ))}
              </ul>
              <ConfirmDelete
                what={`Every cloud version of ${character.name}`}
                onConfirm={() => onDeleteCharacter(character.characterId)}
                className="txtbtn"
              >
                Delete all versions
              </ConfirmDelete>
            </li>
          ))}
        </ul>
      )}

      {conflict !== null && (
        <ResponsiveDialog
          title="Already in this browser"
          open
          onClose={() => onResolveConflict(null)}
          footer={
            <>
              <button type="button" className="secondary" onClick={() => onResolveConflict(null)}>
                Cancel
              </button>
              <button type="button" className="secondary" onClick={() => onResolveConflict('keepBoth')}>
                Keep both
              </button>
              <button type="button" className="del" onClick={() => onResolveConflict('replace')}>
                Replace
              </button>
            </>
          }
        >
          <p className="hint" style={{ marginTop: 0 }}>
            {conflict.name} is already in this browser.
          </p>
          <p className="hint">
            This browser's copy:{' '}
            {conflict.localUpdatedAt === null ? 'damaged' : `edited ${formatWhen(conflict.localUpdatedAt)}`}
            . Cloud version: edited {formatWhen(conflict.cloudUpdatedAt)}.
          </p>
          {conflict.localUpdatedAt !== null && conflict.cloudUpdatedAt < conflict.localUpdatedAt && (
            <p className="hint">The cloud version is older than this browser's copy.</p>
          )}
        </ResponsiveDialog>
      )}
    </div>
  );
}
```

ISO strings of the same format compare lexically in time order, so `<` is the right comparison and no date arithmetic is needed. If the existing CSS classes lay out badly, add the few rules needed to `src/ui/styles.css`, scoped under a new `.cloud` class on the root `div`, and nothing else.

Run `npx vitest run src/ui/screens/CloudScreen.test.tsx` and expect 7 passed. To prove it bites, invert the older-copy comparison (`>`): only the "asks Replace or Keep both" test should fail. Then restore it.

- [ ] **Step 6: Story**

```tsx
// src/ui/screens/CloudScreen.stories.tsx
import type { Meta, StoryObj } from '@storybook/react-vite';
import { CloudScreen } from './CloudScreen.js';

const meta = {
  title: 'Screens/Cloud',
  component: CloudScreen,
  args: {
    message: null,
    conflict: null,
    onBack: () => {},
    onSignIn: () => {},
    onSignOut: () => {},
    onRestore: () => {},
    onDeleteVersion: () => {},
    onDeleteCharacter: () => {},
    onResolveConflict: () => {},
    view: {
      status: 'signedIn',
      user: { name: 'Ja', email: 'ja@example.com' },
      totalBytes: 78_000,
      busy: false,
      characters: [
        {
          characterId: 'c1',
          name: 'Zahir ibn Talaar',
          level: 5,
          versions: [
            { uploadedAt: '2026-09-30T20:11:05.002Z', sheetUpdatedAt: '2026-09-30T20:10:00.000Z', name: 'Zahir ibn Talaar', level: 5, bytes: 40_000, fromNewerApp: false },
            { uploadedAt: '2026-09-24T18:03:12.345Z', sheetUpdatedAt: '2026-09-24T17:58:40.120Z', name: 'Zahir ibn Talaar', level: 4, bytes: 38_000, fromNewerApp: false },
          ],
        },
      ],
    },
  },
} satisfies Meta<typeof CloudScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {};
export const SignedOut: Story = {
  args: { view: { status: 'signedOut', user: null, characters: [], totalBytes: 0, busy: false } },
};
export const Conflict: Story = {
  args: {
    conflict: { name: 'Zahir ibn Talaar', localUpdatedAt: '2026-09-30T20:10:00.000Z', cloudUpdatedAt: '2026-09-24T17:58:40.120Z' },
  },
};
```

- [ ] **Step 7: The two buttons**

`HubGrid.tsx`: add to `Props`:

```ts
  /** Absent hides the button — the stories and any screen without a cloud. */
  onUpload?(): void;
  /** The last upload's line: "Uploaded 24 Sep, 18:03" or the reason it failed. */
  uploadNotice?: string | null;
```

Destructure both. After the Export button, add:

```tsx
        {onUpload !== undefined && (
          <button type="button" className="newcat" onClick={onUpload}>
            Upload to cloud
          </button>
        )}
        {uploadNotice != null && <p className="hint">{uploadNotice}</p>}
```

`CharacterHub.tsx`: add the same two optional props to its `Props`, destructure them, and pass them to `HubGrid` with `{...(onUpload ? { onUpload } : {})}` and `uploadNotice={uploadNotice ?? null}`. The first form is needed because of `exactOptionalPropertyTypes`, the same as `wiredSections`.

`CharacterList.tsx`: add `onOpenCloud?(): void;` to `Props` and destructure it. Before the Import button, add:

```tsx
            {onOpenCloud !== undefined && (
              <button type="button" className="txtbtn" onClick={onOpenCloud}>
                Cloud
              </button>
            )}
```

- [ ] **Step 8: Wire the App**

`src/ui/App.tsx`:
- Import `CloudBackup` and `type RestoreChoice` from `../business/index.js`, `useCloud` and `useUploadNotice` from `./bind.js`, and `CloudScreen` and `formatWhen` from `./screens/CloudScreen.js`, plus `type ConflictView` from `./types.js`.
- Change the signature to `export function App({ library, cloud }: { library: CharacterLibraryBO; cloud: CloudBackup })`.
- In the route switch, add a branch before `route.name === 'raw'`: `route.name === 'cloud' ? <Cloud library={library} cloud={cloud} /> : …`.
- Pass `onOpenCloud={() => navigate({ name: 'cloud' })}` to `CharacterList`.
- Pass `cloud` through `Character` to `Sheet`. In `Sheet`, add:

```tsx
  const notice = useUploadNotice(cloud, id);
  // …and on CharacterHub:
      onUpload={() => void cloud.upload(id)}
      uploadNotice={
        notice === null ? null : notice.ok ? `Uploaded ${formatWhen(notice.uploadedAt)}` : notice.message
      }
```

Add the component:

```tsx
/**
 * The cloud screen's shell: it refreshes on arrival, and owns the two pieces of transient state
 * the business layer has no business holding — the last sentence, and the open Replace / Keep
 * both question with the version it is about.
 */
function Cloud({ library, cloud }: { library: CharacterLibraryBO; cloud: CloudBackup }) {
  const view = useCloud(cloud);
  const [message, setMessage] = useState<string | null>(null);
  const [asking, setAsking] = useState<
    { characterId: string; uploadedAt: string; conflict: ConflictView } | null
  >(null);

  useEffect(() => {
    void cloud.refresh().then(setMessage);
  }, [cloud]);

  const restore = async (characterId: string, uploadedAt: string, choice?: RestoreChoice) => {
    const result = await cloud.restore(characterId, uploadedAt, choice);
    if (result.ok) {
      navigate({ name: 'list' });
    } else if (result.kind === 'conflict') {
      setAsking({ characterId, uploadedAt, conflict: result });
    } else {
      setMessage(result.message);
    }
  };

  return (
    <CloudScreen
      view={view}
      message={message}
      conflict={asking?.conflict ?? null}
      onBack={() => navigate({ name: 'list' })}
      onSignIn={() => void cloud.signIn().then(setMessage)}
      onSignOut={() => void cloud.signOut().then(setMessage)}
      onRestore={(characterId, uploadedAt) => void restore(characterId, uploadedAt)}
      onDeleteVersion={(characterId, uploadedAt) =>
        void cloud.deleteVersion(characterId, uploadedAt).then(setMessage)
      }
      onDeleteCharacter={(characterId) => void cloud.deleteCharacter(characterId).then(setMessage)}
      onResolveConflict={(choice) => {
        const pending = asking;
        setAsking(null);
        if (choice !== null && pending !== null) {
          void restore(pending.characterId, pending.uploadedAt, choice);
        }
      }}
    />
  );
}
```

`library` isn't used in `Cloud`. If lint flags it, drop the prop.

`src/main.tsx`: import `CloudBackup` alongside `CharacterLibraryBO`. After `const library = new CharacterLibraryBO();`, add:

```tsx
/** Loads nothing unless a sign-in redirect is returning with an upload to finish. */
const cloud = new CloudBackup(library);
void cloud.resume();
```

Render `<App library={library} cloud={cloud} />`.

`src/ui/App.test.tsx`: in `renderApp`, import `CloudBackup` from `../business/index.js` and render:

```tsx
  const cloud = new CloudBackup(library, {
    load: () => Promise.reject(new Error('no cloud in the shell tests')),
    session: null,
  });
  return { library, ...render(<App library={library} cloud={cloud} />) };
```

- [ ] **Step 9: Full check**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check . && npm run build`
Expected: all green; `vite build` prints a separate chunk for the Firebase code.

Run `npm run dev` and open the app. Check that the list shows **Cloud**, `#/cloud` shows **Sign in with Google**, and a sheet shows **Upload to cloud**. Check in the Network tab that nothing is fetched from `googleapis.com` until one of those is pressed.

- [ ] **Step 10: Commit**

```bash
git add src/ui src/main.tsx
git commit -m "feat(ui): cloud screen, Upload to cloud on the sheet, and the Replace / Keep both dialog"
```

---

### Task 7: Deploy the rules, update the docs, verify live

**Files:**
- Modify: `.github/workflows/deploy.yml`, `docs/superpowers/specs/2026-07-25-dnd-character-sheet-design.md` (§1), `docs/superpowers/specs/2026-09-24-cloud-backup-design.md`, `AGENTS.md`, `docs/BACKLOG.md`

- [ ] **Step 1: CI deploys the rules on `main`**

In `deploy.yml`, after the `action-hosting-deploy` step, add:

```yaml
      # Rules are live-only: a preview channel has no rules of its own, so a pull request must not
      # replace the live ones. Needs the deploy service account to hold "Firebase Rules Admin".
      - if: github.event_name == 'push'
        run: |
          echo '${{ secrets.FIREBASE_SERVICE_ACCOUNT_DND_CHARACTER_SHEET_64A24 }}' > "$RUNNER_TEMP/sa.json"
          GOOGLE_APPLICATION_CREDENTIALS="$RUNNER_TEMP/sa.json" npx --yes firebase-tools@latest deploy --only firestore:rules --project dnd-character-sheet-64a24 --non-interactive
```

- [ ] **Step 2: Deploy the rules once by hand, and check them**

Run: `npx firebase-tools deploy --only firestore:rules --project dnd-character-sheet-64a24` (the user must be logged in).
Expected: `✔ firestore: released rules firestore.rules to cloud.firestore`.

In the console's Firestore → Rules → **Rules Playground**, run two checks:
- A `get` of `/users/UID_A/characters/x`, authenticated as `UID_A`, should be **Allowed**.
- The same path authenticated as `UID_B` should be **Denied**.

Record both results in the PR description.

- [ ] **Step 3: Docs**

- Original spec §1, line 18: replace "No multi-user editing, no sharing, no accounts." with "No multi-user editing and no sharing. Accounts only for optional cloud backup (see `2026-09-24-cloud-backup-design.md`); the local app stays complete and free without one."
- Cloud spec: add a section "12. Deviations found while building" with the three items from this plan's "Deliberate deviations" section.
- `AGENTS.md`:
  - Add a "Current state" bullet: "**Cloud backup** (2026-09-24): Google sign-in, dated versions in Firestore." Mention `src/data/remote/` is the only importer of `firebase` (lint-enforced), the `/__/` service-worker denylist and why, popup in dev versus redirect in production and why, the Firebase chunk size recorded in Task 3, and that the console steps are one-off.
  - In the Map, add a `src/data/remote/` line and a `cloudBackup.ts` line.
  - Update the test count after running `npm test`.
- `docs/BACKLOG.md`: move "Remote backup and restore" to Done with the PR link. Add a new Candidate: "**Automatic cloud sync.** A coarse trigger (on `pagehide`, or every few minutes) for the cloud backup that shipped in PR #N — never local autosave's debounce, because Firestore bills per write."

- [ ] **Step 4: End-to-end, live**

A PR preview channel is its own origin (`…--pr-N-….web.app`), not `authDomain`'s, so the production redirect sign-in can't be trusted there. It is only verifiable on the live `dnd-character-sheet-64a24.web.app` after merge. Before merge, verify on `npm run dev`, which uses popup sign-in:

1. Sign in with Google on `#/cloud`.
2. Open a character, change its name, and immediately press **Upload to cloud**. The line should read "Uploaded …".
3. Go to `#/cloud`. The character should be listed with 1 version and the new name.
4. Delete the character locally from the list.
5. On `#/cloud`, press Restore. It should come back with the same name, without a dialog.
6. Restore the same version again. The dialog should appear. Press **Keep both**: the list should now show two.
7. Delete that version on `#/cloud`. The character should disappear from the cloud list.
8. Sign out. The list should be cleared.

Report what was run and what was seen. After merge, repeat steps 1–3 on the live origin to prove the redirect and the `/__/` denylist.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy.yml docs AGENTS.md
git commit -m "docs: record cloud backup, and deploy Firestore rules from CI"
```
