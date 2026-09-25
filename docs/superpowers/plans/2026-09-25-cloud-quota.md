# Cloud Quota and Layout Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store each player's cloud backups as one versioned Firestore document, `cloud/{uid}`, whose 1 MiB document limit is the quota, and show "Using X of 1.0 MB".

**Architecture:**
- `src/data/migration/` becomes a generic version walk, `parseVersioned`. Characters and the new cloud layout both use it.
- `src/data/remote/layout/v2.ts` is the strict schema of the single cloud document, isolated like `src/data/schema/v1/`.
- Pure functions in `src/data/remote/cloudDocument.ts` apply an upload or a delete to that document in memory. Firestore (`cloudStore.ts`), the in-memory test fake, and the size calculations all share them, so the three cannot disagree.
- `CloudBackup` downloads the document once, decodes every sheet for the list, and restores from that copy.

**Tech Stack:** TypeScript 6, Zod 4.4.3, firebase 12.19.0 (`firebase/firestore/lite`), MobX 7, React 19, Vitest 4, Firebase emulator (firebase-tools 15, Java).

**Spec:** `docs/superpowers/specs/2026-09-25-cloud-quota-design.md`. It amends `docs/superpowers/specs/2026-09-24-cloud-backup-design.md`. Read both, and `AGENTS.md`, before starting.

## Global Constraints

- **Worktree.** Work only in `F:\git\DnD-Character-sheet-cloud-quota`, on branch `feature/cloud-quota`. Run `npm ci` there first.
- **Do not touch `F:\git\DnD-Character-sheet`.** Another session has uncommitted work there.
- **Quota:** `MAX_DOCUMENT_BYTES = 1_048_576`, which is Firestore's own document limit. The usage line reads `Using {formatBytes(used)} of {formatBytes(limit)}`, which gives "of 1.0 MB".
- **Layout path and version:** `cloud/{uid}`, with `layoutVersion: 2`. There is no layout 1 parser. The old `users/{uid}/…` tree is wiped by hand after the deploy.
- **Layout 2 shape:**
  - `{ layoutVersion: 2, portraits?: { [sha256]: bytes }, characters: { [uuidv4]: { [ISO-ms]: { sheet: bytes, portrait: sha256 | null } } } }`
  - It is strict at every level.
  - `portraits` may be absent.
- **Uploads never write an empty map.** Merging `portraits: {}` wipes every stored portrait; this was checked in the emulator.
- **Size rules** (checked against the emulator):
  - string: UTF-8 bytes + 1
  - bytes: their length
  - number: 8
  - boolean, null: 1
  - map: the sum of key and value sizes
  - array: the sum of its values
  - an empty map or array: **1**
  - document: name + fields + 32, where the name is the sum of `id + 1` over each path segment, + 16
- **Oversized writes.** In the emulator an oversized write fails with `failed-precondition` "maximum entity size is 1048576 bytes". Production's code may differ, so the business layer decides "full" by computing the size, never by the error code.
- **No new dependencies.** SHA-256 comes from `crypto.subtle.digest`.
- **`firebase` imports** are allowed only under `src/data/remote/`, excluding `src/data/remote/layout/`. This is lint-enforced.
- **Layout version files** (`layout/v2.ts`) are imported only from inside `src/data/remote/layout/`. This is lint-enforced by Task 3.
- **Before every commit** run `npm test`, `npm run typecheck` and `npm run lint`, and `npx prettier --check .` should be clean.
- **Every new test must be proven to bite.** Break the thing it guards, watch that test alone fail, then restore it. Report what you broke.
- **Verify APIs against the installed versions**, not memory: zod 4.4.3, firebase 12.19.0, vitest 4.
- **Commits:**
  - Conventional Commit prefixes.
  - Every message ends with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
  - Stage explicit paths, never `git add -A`.

## Review Focus

These are the inputs most likely to hurt a player that no spec example exercises. Each has a test in the task named.

1. **A player who never uploaded a portrait.** Their document has no `portraits` field. It must parse, list, restore and delete. Tests: Task 3 (layout parse, `withVersion` / `withoutVersions`) and Task 4 (emulator round-trip).
2. **Uploading from a sheet before the cloud screen was opened in this session, when the cloud is full.** The player must get the "needs X and Y is free" sentence, not "failed unexpectedly". Test: Task 5.
3. **Uploading the same portrait twice.** It is stored once, and usage grows only by the version. Tests: Task 3 (`withVersion`) and Task 5.
4. **Deleting the last version of the last character.** What remains, `{ layoutVersion: 2, characters: {} }` with possibly `portraits: {}`, must still parse and be writable. Tests: Task 3 and Task 4.
5. **Signing out, then another account signing in on the same device.** Nothing decoded from the first account may be restorable. Test: Task 5.

---

### Task 1: One migration walk for characters and the cloud layout

**Files:**
- Create: `src/data/migration/versioned.ts`, `src/data/migration/versioned.test.ts`
- Modify: `src/data/migration/parseCharacter.ts`, `src/data/migration/versionOf.ts`, `src/data/migration/versionOf.test.ts`

**Interfaces:**
- Produces:
  - `interface VersionedFormat { versionKey: string; current: number; schemas: Readonly<Record<number, z.ZodType>>; migrations: ReadonlyMap<number, Migration> }`
  - `type ParseResult<T> = { ok: true; value: T } | { ok: false; error: LoadError; raw: unknown }`
  - `parseVersioned<T>(raw: unknown, format: VersionedFormat): ParseResult<T>`
  - `versionOf(raw: unknown, current: number, key?: string): number`, with `key` defaulting to `'schemaVersion'`
- Unchanged: `parseCharacter(raw, registry?)`, `LoadResult`, `MigrationRegistry` and `defaultRegistry`, including all their callers.

- [ ] **Step 1: Write the failing tests**

`src/data/migration/versioned.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseVersioned, type VersionedFormat } from './versioned.js';

/** One version, keyed by whichever field the format names. */
const oneVersion = (versionKey: string): VersionedFormat => ({
  versionKey,
  current: 1,
  schemas: { 1: z.object({ [versionKey]: z.literal(1) }).strict() },
  migrations: new Map(),
});

describe('parseVersioned', () => {
  it('reads the version from the field its format names', () => {
    expect(parseVersioned({ layoutVersion: 1 }, oneVersion('layoutVersion'))).toEqual({
      ok: true,
      value: { layoutVersion: 1 },
    });
  });

  it("never reads another format's version field", () => {
    expect(parseVersioned({ schemaVersion: 1 }, oneVersion('layoutVersion'))).toMatchObject({
      ok: false,
      error: { code: 'UNVERSIONED' },
    });
    expect(parseVersioned({ layoutVersion: 1 }, oneVersion('schemaVersion'))).toMatchObject({
      ok: false,
      error: { code: 'UNVERSIONED' },
    });
  });

  it('migrates a format under its own key', () => {
    const format: VersionedFormat = {
      versionKey: 'layoutVersion',
      current: 2,
      schemas: {
        1: z.object({ layoutVersion: z.literal(1), a: z.string() }).strict(),
        2: z.object({ layoutVersion: z.literal(2), b: z.string() }).strict(),
      },
      migrations: new Map([[1, (doc) => ({ layoutVersion: 2, b: (doc as { a: string }).a })]]),
    };
    expect(parseVersioned({ layoutVersion: 1, a: 'x' }, format)).toEqual({
      ok: true,
      value: { layoutVersion: 2, b: 'x' },
    });
  });
});
```

Append to the `describe` in `src/data/migration/versionOf.test.ts`:

```ts
  it('reads the field it is told to', () => {
    expect(versionOf({ layoutVersion: 2 }, 2, 'layoutVersion')).toBe(2);
    expect(() => versionOf({ schemaVersion: 2 }, 2, 'layoutVersion')).toThrow(CharacterLoadError);
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/data/migration`
Expected: FAIL. `versioned.js` cannot be resolved, and `versionOf` ignores its third argument.

- [ ] **Step 3: Implement**

In `src/data/migration/versionOf.ts`:
- Change the signature to `export function versionOf(raw: unknown, current: number, key = 'schemaVersion'): number`.
- Read `const found = raw[key];`.
- Update the doc comment: "Reads the version field (`schemaVersion` for a character, `layoutVersion` for the cloud layout) from an untrusted value."

Create `src/data/migration/versioned.ts` by **moving** `validateAt`, `runMigration` and `upgrade` out of `parseCharacter.ts`, together with their doc comments, which stay true. Rename `registry` to `format`:

```ts
import type { z } from 'zod';
import { CharacterLoadError, toSchemaIssues, type LoadError } from './errors.js';
import type { Migration } from './migrations.js';
import { versionOf } from './versionOf.js';

/**
 * A stored format versioned by one field: the character document (`schemaVersion`) and the cloud
 * layout (`layoutVersion`). The walk below is machinery, not a schema, so sharing it does not
 * breach the rule that versions share nothing (src/data/schema/README.md).
 */
export interface VersionedFormat {
  versionKey: string;
  current: number;
  schemas: Readonly<Record<number, z.ZodType>>;
  migrations: ReadonlyMap<number, Migration>;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: LoadError; raw: unknown };

// validateAt(format, version, doc) and runMigration(format, version, doc): moved verbatim,
// `registry` renamed to `format`.

function upgrade(raw: unknown, format: VersionedFormat): unknown {
  let doc: unknown = raw;
  for (
    let version = versionOf(raw, format.current, format.versionKey);
    version < format.current;
    version++
  ) {
    doc = validateAt(format, version, doc);
    doc = runMigration(format, version, doc);
  }
  return validateAt(format, format.current, doc);
}

/**
 * Reads an untrusted value at its own version and migrates it to `format.current`. Never repairs
 * or defaults. A failed result means the value is bad; a thrown error means this loader is bad.
 */
export function parseVersioned<T>(raw: unknown, format: VersionedFormat): ParseResult<T> {
  try {
    return { ok: true, value: upgrade(raw, format) as T };
  } catch (caught) {
    if (caught instanceof CharacterLoadError) return { ok: false, error: caught.detail, raw };
    throw caught;
  }
}
```

`parseCharacter.ts` keeps `LoadResult`, `MigrationRegistry` and `defaultRegistry` exactly as they are. Its body becomes:

```ts
export function parseCharacter(
  raw: unknown,
  registry: MigrationRegistry = defaultRegistry,
): LoadResult {
  const parsed = parseVersioned<CharacterDocument>(raw, {
    versionKey: 'schemaVersion',
    ...registry,
  });
  return parsed.ok ? { ok: true, doc: parsed.value } : parsed;
}
```

Keep `parseCharacter`'s doc comment, adding one sentence: "The walk itself is `parseVersioned`, shared with the cloud layout."

- [ ] **Step 4: Run all the tests**

Run: `npm test`
Expected: PASS. The existing `parseCharacter.test.ts` must pass unmodified, including its synthetic three-version registry.

- [ ] **Step 5: Prove it bites**

Temporarily replace `raw[key]` with `raw.schemaVersion` in `versionOf.ts`. Expect only these to fail:
- `versioned.test.ts` "never reads another format's version field"
- "migrates a format under its own key"
- `versionOf.test.ts` "reads the field it is told to"

Restore.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint
git add src/data/migration
git commit -m "refactor(data): one migration walk, parameterised by its version field"
```

---

### Task 2: Byte formatting in `shared/`, and Firestore's size rules

**Files:**
- Create: `src/shared/formatBytes.ts`, `src/shared/formatBytes.test.ts`, `src/data/remote/size.ts`, `src/data/remote/size.test.ts`
- Modify: `src/ui/screens/CloudScreen.tsx`, which drops its own `formatBytes` and imports it from `shared`

**Interfaces:**
- Produces:
  - `formatBytes(bytes: number): string` (unchanged behaviour: `< 1_000_000` gives "12.3 KB", otherwise "1.0 MB")
  - `MAX_DOCUMENT_BYTES = 1_048_576`
  - `stringSize(s: string): number`
  - `valueSize(value: unknown): number`
  - `documentSize(path: readonly string[], fields: Readonly<Record<string, unknown>>): number`

- [ ] **Step 1: Write the failing tests**

`src/shared/formatBytes.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatBytes } from './formatBytes.js';

describe('formatBytes', () => {
  it('uses KB below a million bytes and MB from there', () => {
    expect(formatBytes(12_345)).toBe('12.3 KB');
    expect(formatBytes(999_999)).toBe('1000.0 KB');
    expect(formatBytes(1_048_576)).toBe('1.0 MB');
  });
});
```

`src/data/remote/size.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MAX_DOCUMENT_BYTES, documentSize, stringSize, valueSize } from './size.js';

describe('size', () => {
  it('is Firestore’s document limit', () => {
    expect(MAX_DOCUMENT_BYTES).toBe(1_048_576);
  });

  it.each<[string, unknown, number]>([
    ['null', null, 1],
    ['a boolean', true, 1],
    ['an integer', 2, 8],
    ['a double', 2.5, 8],
    ['an ASCII string', 'ab', 3],
    ['a multi-byte string, by UTF-8 bytes', 'é', 3],
    ['bytes', new Uint8Array(5), 5],
    ['an array', [1, 'ab'], 11],
    ['an empty array, as the emulator counts it', [], 1],
    ['a map', { k: null }, 3],
    ['an empty map, as the emulator counts it', {}, 1],
    ['a nested map', { m: { k: new Uint8Array(4) } }, 2 + 2 + 4],
  ])('sizes %s', (_, value, size) => {
    expect(valueSize(value)).toBe(size);
  });

  it('sizes a string key the way it sizes a string value', () => {
    expect(stringSize('cloud')).toBe(6);
  });

  it('sizes a document: its name, its fields, and 32', () => {
    // name: ('cloud' 6) + ('u1' 3) + 16 = 25. Field 'a': 2 + 8.
    expect(documentSize(['cloud', 'u1'], { a: 1 })).toBe(25 + 10 + 32);
  });

  it('refuses a value Firestore has no size for, rather than guessing', () => {
    expect(() => valueSize(undefined)).toThrow(TypeError);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/shared src/data/remote/size.test.ts`
Expected: FAIL, because the modules do not exist.

- [ ] **Step 3: Implement**

`src/shared/formatBytes.ts` is the body moved from `CloudScreen.tsx`, with a doc comment:

```ts
/**
 * Decimal units, as a phone's storage settings show them. In `shared/` because the business
 * layer builds a sentence with it ("this version needs 19.6 KB") and the cloud screen shows it.
 */
export function formatBytes(bytes: number): string {
  return bytes < 1_000_000
    ? `${(bytes / 1000).toFixed(1)} KB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;
}
```

In `CloudScreen.tsx`, delete the local `formatBytes` and add `import { formatBytes } from '../../shared/formatBytes.js';`.

`src/data/remote/size.ts`:

```ts
/**
 * A document's storage size by Firestore's published rules
 * (firebase.google.com/docs/firestore/storage-size), checked against the emulator by
 * binary-searching the largest document it accepts (cloud-quota spec §3). Only ever a display:
 * Firestore enforces the limit, and `cloudStore.emulator.test.ts` checks they agree.
 */
export const MAX_DOCUMENT_BYTES = 1_048_576;

const utf8 = new TextEncoder();

export const stringSize = (value: string): number => utf8.encode(value).byteLength + 1;

const sum = (sizes: number[]): number => sizes.reduce((total, size) => total + size, 0);

export function valueSize(value: unknown): number {
  if (value === null || typeof value === 'boolean') return 1;
  if (typeof value === 'number') return 8;
  if (typeof value === 'string') return stringSize(value);
  if (value instanceof Uint8Array) return value.byteLength;
  // Empty containers: the published table says 0, the emulator measures 1. Counting 1 errs, by
  // one byte, towards "too big".
  if (Array.isArray(value)) return value.length === 0 ? 1 : sum(value.map(valueSize));
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length === 0 ? 1 : sum(entries.map(([key, v]) => stringSize(key) + valueSize(v)));
  }
  throw new TypeError(`Firestore has no size for a ${typeof value}`);
}

/** `path` alternates collection and document ids, e.g. `['cloud', uid]`. */
export function documentSize(
  path: readonly string[],
  fields: Readonly<Record<string, unknown>>,
): number {
  const name = sum(path.map(stringSize)) + 16;
  const body = sum(Object.entries(fields).map(([key, v]) => stringSize(key) + valueSize(v)));
  return name + body + 32;
}
```

- [ ] **Step 4: Run all the tests**

Run: `npm test`
Expected: PASS. `CloudScreen.test.tsx`'s "3.4 MB" still passes.

- [ ] **Step 5: Prove it bites**

Make the empty-map branch return `0`. Only the two "as the emulator counts it" rows should fail. Restore.

- [ ] **Step 6: Commit**

```bash
npm run typecheck && npm run lint
git add src/shared src/data/remote/size.ts src/data/remote/size.test.ts src/ui/screens/CloudScreen.tsx
git commit -m "feat(data): Firestore's document size rules, and formatBytes moved to shared"
```

---

### Task 3: Layout 2, and the in-memory upload and delete

**Files:**
- Create:
  - `src/data/remote/layout/v2.ts`, `src/data/remote/layout/v2.test.ts`
  - `src/data/remote/layout/index.ts`
  - `src/data/remote/cloudDocument.ts`, `src/data/remote/cloudDocument.test.ts`
- Modify: `src/data/remote/codec.ts`, `src/data/remote/codec.test.ts`, `eslint.config.js`

**Interfaces:**
- Consumes: `parseVersioned`, `ParseResult`, `VersionedFormat` (Task 1); `documentSize` (Task 2).
- Produces:
  - `layout/index.ts`:
    - `CURRENT_LAYOUT` (the literal `2`)
    - `type CloudDocument` (the layout 2 type)
    - `type CloudVersionData = CloudDocument['characters'][string][string]`
    - `LAYOUT_FORMAT: VersionedFormat`
    - `parseCloudDocument(raw: unknown): ParseResult<CloudDocument>`
  - `cloudDocument.ts`:
    - `interface NewVersion { sheet: Uint8Array; portrait: { hash: string; bytes: Uint8Array } | null }`
    - `cloudDocumentPath(uid: string): [string, string]`
    - `cloudDocumentSize(uid: string, doc: CloudDocument): number`
    - `withVersion(doc: CloudDocument | null, characterId: string, uploadedAt: string, version: NewVersion): CloudDocument`
    - `withoutVersions(doc: CloudDocument, characterId: string, uploadedAts: readonly string[] | null): { doc: CloudDocument; removed: string[][] }`. `null` means every version of that character.
  - `codec.ts`:
    - `portraitHash(bytes: Uint8Array): Promise<string>`, lowercase hex
    - `Payload`'s fields are widened to plain `Uint8Array`, so bytes parsed out of the layout type-check

- [ ] **Step 1: Write the failing layout tests**

`src/data/remote/layout/v2.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ID_A } from '../../../test/fixtures.js';
import { parseCloudDocument } from './index.js';

const HASH = 'a'.repeat(64);
const AT = '2026-09-25T10:00:00.000Z';
const valid = () => ({
  layoutVersion: 2,
  portraits: { [HASH]: new Uint8Array([1]) },
  characters: { [ID_A]: { [AT]: { sheet: new Uint8Array([2]), portrait: HASH } } },
});

describe('layout 2', () => {
  it('parses a valid document completely unaltered', () => {
    const raw = valid();
    expect(parseCloudDocument(raw)).toEqual({ ok: true, value: raw });
  });

  it('parses a player’s document that never had a portrait', () => {
    const raw = {
      layoutVersion: 2,
      characters: { [ID_A]: { [AT]: { sheet: new Uint8Array([2]), portrait: null } } },
    };
    expect(parseCloudDocument(raw)).toEqual({ ok: true, value: raw });
  });

  it('parses what deleting every version leaves', () => {
    expect(parseCloudDocument({ layoutVersion: 2, portraits: {}, characters: {} }).ok).toBe(true);
  });

  it.each<[string, (doc: ReturnType<typeof valid>) => void]>([
    ['the root', (doc) => Object.assign(doc, { extra: 1 })],
    ['a version', (doc) => Object.assign(doc.characters[ID_A]![AT]!, { extra: 1 })],
    ['a character id that is not a v4 uuid', (doc) => {
      doc.characters = { 'not-a-uuid': doc.characters[ID_A]! };
    }],
    ['an upload time without milliseconds', (doc) => {
      doc.characters[ID_A] = { '2026-09-25T10:00:00Z': doc.characters[ID_A]![AT]! };
    }],
    ['a portrait key that is not a SHA-256', (doc) => {
      doc.portraits = { nope: new Uint8Array([1]) };
    }],
    ['a sheet that is not bytes', (doc) => {
      doc.characters[ID_A]![AT]!.sheet = 'gzip' as unknown as Uint8Array;
    }],
  ])('rejects %s as INVALID_AT_VERSION', (_, damage) => {
    const raw = valid();
    damage(raw);
    expect(parseCloudDocument(raw)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_AT_VERSION', version: 2 },
    });
  });

  it('reports a newer layout without reading it', () => {
    expect(parseCloudDocument({ layoutVersion: 3, anything: true })).toMatchObject({
      ok: false,
      error: { code: 'FROM_FUTURE', found: 3, current: 2 },
    });
  });

  it('reports a document with no layoutVersion as unversioned', () => {
    expect(parseCloudDocument({ characters: {} })).toMatchObject({
      ok: false,
      error: { code: 'UNVERSIONED' },
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/data/remote/layout`
Expected: FAIL, because `./index.js` does not exist.

- [ ] **Step 3: Implement the layout**

`src/data/remote/layout/v2.ts`. It must not import from `src/data/schema/`, because layout files share nothing (spec §8):

```ts
import { z } from 'zod';

/**
 * Layout 2 of the cloud: one document per player, `cloud/{uid}`. Strict at every level, as
 * `src/data/schema/v1/` is: an unknown key fails the read instead of being dropped. A shipped
 * layout is never edited. Adding a field means layout 3, in its own file.
 *
 * Its own primitives, not the character schema's: the same validators on purpose (uuidv4 and
 * millisecond ISO times, which AGENTS.md explains), but a copy, so a character schema change can
 * never change what a stored layout accepts.
 */
const bytes = z.instanceof(Uint8Array);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const characterId = z.uuidv4();
const uploadedAt = z.iso.datetime({ precision: 3 });

const version = z
  .object({
    /** `JSON.stringify(doc)`, gzipped. The sheet has its own `schemaVersion`; this never looks inside. */
    sheet: bytes,
    /** A key of `portraits`, or `null`. */
    portrait: sha256.nullable(),
  })
  .strict();

export const layoutV2Schema = z
  .object({
    layoutVersion: z.literal(2),
    /** Absent for a player who never uploaded a portrait: an upload never writes an empty map. */
    portraits: z.record(sha256, bytes).optional(),
    characters: z.record(characterId, z.record(uploadedAt, version)),
  })
  .strict();

export type LayoutV2 = z.infer<typeof layoutV2Schema>;
```

`src/data/remote/layout/index.ts`:

```ts
import { parseVersioned, type ParseResult, type VersionedFormat } from '../../migration/versioned.js';
import { layoutV2Schema, type LayoutV2 } from './v2.js';

/**
 * The only way into `layout/` from outside it, like `src/data/schema/index.ts`: consumers ask for
 * the current layout, never a version file.
 */
export const CURRENT_LAYOUT = 2 as const;

export type CloudDocument = LayoutV2;
export type CloudVersionData = CloudDocument['characters'][string][string];

/**
 * No layout 1 here: it was many documents, and was wiped rather than migrated (spec §1). No
 * migrations until layout 3, which adds one, and a transactional write-back (spec §8).
 */
export const LAYOUT_FORMAT: VersionedFormat = {
  versionKey: 'layoutVersion',
  current: CURRENT_LAYOUT,
  schemas: { 2: layoutV2Schema },
  migrations: new Map(),
};

export const parseCloudDocument = (raw: unknown): ParseResult<CloudDocument> =>
  parseVersioned<CloudDocument>(raw, LAYOUT_FORMAT);
```

Check against zod 4.4.3 that `z.record(keySchema, value)` rejects a key that fails `keySchema`, rather than dropping it. The "not a v4 uuid" and "without milliseconds" rows prove it either way.

- [ ] **Step 4: Run the layout tests**

Run: `npx vitest run src/data/remote/layout`
Expected: PASS.

- [ ] **Step 5: Write the failing tests for the in-memory operations and the hash**

`src/data/remote/cloudDocument.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ID_A, ID_B } from '../../test/fixtures.js';
import {
  cloudDocumentSize,
  withoutVersions,
  withVersion,
  type NewVersion,
} from './cloudDocument.js';
import { parseCloudDocument, type CloudDocument } from './layout/index.js';

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const T1 = '2026-09-25T10:00:00.000Z';
const T2 = '2026-09-25T11:00:00.000Z';
const sheet = (n: number) => new Uint8Array(n).fill(7);
const plain = (n: number): NewVersion => ({ sheet: sheet(n), portrait: null });
const pictured = (n: number, hash: string): NewVersion => ({
  sheet: sheet(n),
  portrait: { hash, bytes: new Uint8Array([9, 9]) },
});

describe('withVersion', () => {
  it('creates the document on a first upload, with no portraits field when there is no portrait', () => {
    const doc = withVersion(null, ID_A, T1, plain(3));
    expect(doc).toEqual({
      layoutVersion: 2,
      characters: { [ID_A]: { [T1]: { sheet: sheet(3), portrait: null } } },
    });
    expect(parseCloudDocument(doc).ok).toBe(true);
  });

  it('stores one portrait once, however many versions use it', () => {
    const once = withVersion(null, ID_A, T1, pictured(3, H1));
    const twice = withVersion(once, ID_A, T2, pictured(3, H1));
    expect(Object.keys(twice.portraits ?? {})).toEqual([H1]);
    // The second version's own entry is the whole growth: key T2 (24 + 1), then `sheet` (6) + 3
    // bytes, then `portrait` (9) + the hash as a string (64 + 1). The portrait itself is not
    // stored again.
    expect(cloudDocumentSize('u1', twice) - cloudDocumentSize('u1', once)).toBe(
      25 + (6 + 3) + (9 + 65),
    );
  });

  it('keeps every other character and version', () => {
    const doc = withVersion(withVersion(null, ID_A, T1, plain(1)), ID_B, T2, plain(2));
    expect(Object.keys(doc.characters)).toEqual([ID_A, ID_B]);
    expect(withVersion(doc, ID_A, T2, plain(3)).characters[ID_A]).toHaveProperty(T1);
  });

  it('never changes the document it is given', () => {
    const doc = withVersion(null, ID_A, T1, plain(1));
    const before = structuredClone(doc);
    withVersion(doc, ID_A, T2, pictured(2, H1));
    expect(doc).toEqual(before);
  });
});

describe('withoutVersions', () => {
  const two = (): CloudDocument =>
    withVersion(withVersion(null, ID_A, T1, pictured(1, H1)), ID_A, T2, pictured(1, H2));

  it('removes one version by its own path and keeps the other', () => {
    const { doc, removed } = withoutVersions(two(), ID_A, [T1]);
    expect(Object.keys(doc.characters[ID_A]!)).toEqual([T2]);
    expect(removed).toContainEqual(['characters', ID_A, T1]);
  });

  it('removes the character itself with its last version, never leaving an empty map', () => {
    const { doc, removed } = withoutVersions(withVersion(null, ID_A, T1, plain(1)), ID_A, [T1]);
    expect(doc.characters).toEqual({});
    expect(removed).toEqual([['characters', ID_A]]);
    expect(parseCloudDocument(doc).ok).toBe(true);
  });

  it('removes a portrait no remaining version uses, and keeps one still in use', () => {
    const shared = withVersion(withVersion(null, ID_A, T1, pictured(1, H1)), ID_B, T1, pictured(1, H1));
    expect(withoutVersions(shared, ID_A, null).doc.portraits).toEqual({ [H1]: new Uint8Array([9, 9]) });

    const { doc, removed } = withoutVersions(two(), ID_A, [T1]);
    expect(Object.keys(doc.portraits ?? {})).toEqual([H2]);
    expect(removed).toContainEqual(['portraits', H1]);
  });

  it('removes every version when given null', () => {
    const { doc, removed } = withoutVersions(two(), ID_A, null);
    expect(doc.characters).toEqual({});
    expect(doc.portraits).toEqual({});
    expect(removed).toEqual(
      expect.arrayContaining([['characters', ID_A], ['portraits', H1], ['portraits', H2]]),
    );
  });

  it('is a no-op for a version that is already gone', () => {
    const doc = two();
    expect(withoutVersions(doc, ID_A, ['2026-01-01T00:00:00.000Z'])).toEqual({ doc, removed: [] });
    expect(withoutVersions(doc, ID_B, null)).toEqual({ doc, removed: [] });
  });

  it('never changes the document it is given', () => {
    const doc = two();
    const before = structuredClone(doc);
    withoutVersions(doc, ID_A, null);
    expect(doc).toEqual(before);
  });
});
```

Add to `src/data/remote/codec.test.ts`:

```ts
  it('keys a portrait by the lowercase hex SHA-256 of its bytes', async () => {
    // The published SHA-256 of "abc".
    expect(await portraitHash(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
```

Also add `portraitHash` to that file's import.

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run src/data/remote/cloudDocument.test.ts src/data/remote/codec.test.ts`
Expected: FAIL. `cloudDocument.js` does not exist, and `portraitHash` is not exported.

- [ ] **Step 7: Implement**

`src/data/remote/cloudDocument.ts`:

```ts
import { CURRENT_LAYOUT, type CloudDocument } from './layout/index.js';
import { documentSize } from './size.js';

/**
 * An upload's data. The portrait is keyed by its SHA-256 (`portraitHash`), so an image shared
 * by several versions is stored once.
 */
export interface NewVersion {
  sheet: Uint8Array;
  portrait: { hash: string; bytes: Uint8Array } | null;
}

export const cloudDocumentPath = (uid: string): [string, string] => ['cloud', uid];

export const cloudDocumentSize = (uid: string, doc: CloudDocument): number =>
  documentSize(cloudDocumentPath(uid), doc);

/**
 * The document after an upload, exactly as Firestore's `setDoc(..., { merge: true })` in
 * `cloudStore.ts` leaves it. That includes never writing an empty `portraits`: merging `{}`
 * wipes the stored map. Shared by the store's test fake and by the quota message, so the three
 * cannot disagree.
 */
export function withVersion(
  doc: CloudDocument | null,
  characterId: string,
  uploadedAt: string,
  version: NewVersion,
): CloudDocument {
  const base: CloudDocument = doc ?? { layoutVersion: CURRENT_LAYOUT, characters: {} };
  return {
    ...base,
    ...(version.portrait === null
      ? {}
      : { portraits: { ...base.portraits, [version.portrait.hash]: version.portrait.bytes } }),
    characters: {
      ...base.characters,
      [characterId]: {
        ...base.characters[characterId],
        [uploadedAt]: { sheet: version.sheet, portrait: version.portrait?.hash ?? null },
      },
    },
  };
}

/**
 * The document after deleting some versions of one character (`null`: all of them), and the field
 * paths the store deletes to get there.
 *
 * - A character left with no versions is removed whole, never left as an empty map.
 * - A portrait no remaining version references is removed too.
 *
 * Decided from `doc` alone. That is why the store calls it inside a transaction, on a document it
 * has just read.
 */
export function withoutVersions(
  doc: CloudDocument,
  characterId: string,
  uploadedAts: readonly string[] | null,
): { doc: CloudDocument; removed: string[][] } {
  const versions = doc.characters[characterId] ?? {};
  const doomed = Object.keys(versions).filter(
    (uploadedAt) => uploadedAts === null || uploadedAts.includes(uploadedAt),
  );
  if (doomed.length === 0) return { doc, removed: [] };

  const kept = Object.fromEntries(
    Object.entries(versions).filter(([uploadedAt]) => !doomed.includes(uploadedAt)),
  );
  const removed: string[][] = [];
  const characters = Object.fromEntries(
    Object.entries(doc.characters).filter(([id]) => id !== characterId),
  );
  if (Object.keys(kept).length === 0) {
    removed.push(['characters', characterId]);
  } else {
    characters[characterId] = kept;
    for (const uploadedAt of doomed) removed.push(['characters', characterId, uploadedAt]);
  }

  const used = new Set(
    Object.values(characters).flatMap((vs) => Object.values(vs).map((v) => v.portrait)),
  );
  if (doc.portraits === undefined) return { doc: { ...doc, characters }, removed };
  const portraits = Object.fromEntries(
    Object.entries(doc.portraits).filter(([hash]) => used.has(hash)),
  );
  for (const hash of Object.keys(doc.portraits)) {
    if (!used.has(hash)) removed.push(['portraits', hash]);
  }
  return { doc: { ...doc, characters, portraits }, removed };
}
```

In `src/data/remote/codec.ts`:
- Widen `Payload` to `sheet: Uint8Array; portrait: Uint8Array | null;`. The `Uint8Array<ArrayBuffer>` narrowing no longer holds once bytes come out of a parsed layout, and every use already copies them.
- Add:

```ts
/** Lowercase hex SHA-256 of a portrait's bytes: its key in the cloud document (spec §2). */
export async function portraitHash(bytes: Uint8Array): Promise<string> {
  // Copied: `digest` wants an ArrayBuffer-backed view, whatever buffer `bytes` sits on.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 8: Fence off layout version files in lint**

In `eslint.config.js`:
- Add beside `SCHEMA_VERSION_PATTERN`:

```js
/**
 * The same isolation for the cloud layout: `src/data/remote/layout/v2.ts` is imported only by
 * `layout/index.ts`, so a consumer asks for the current layout and never a version by name.
 */
const LAYOUT_VERSION_PATTERN = {
  group: ['**/layout/v*'],
  message:
    'Import src/data/remote/layout (its index), not a layout version file directly (see docs/superpowers/specs/2026-09-25-cloud-quota-design.md §8).',
};
```

- Add `LAYOUT_VERSION_PATTERN` to the `extra` of the `data`, `business` and `ui` boundaries.
- Change the `data/remote` boundary to:

```js
  boundary('data/remote', ['business', 'ui'], {
    ignores: ['src/data/remote/layout/**/*.ts'],
    extra: [SCHEMA_VERSION_PATTERN, LAYOUT_VERSION_PATTERN],
  }),
  // The one place that may import a layout version file. Pure: no `firebase` either.
  boundary('data/remote/layout', ['business', 'ui'], {
    extra: [SCHEMA_VERSION_PATTERN, FIREBASE_PATTERN],
  }),
```

- [ ] **Step 9: Run everything**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 10: Prove it bites**

1. In `withVersion`, write `portraits: { ...base.portraits }` even when `version.portrait === null`. Only "creates the document on a first upload…" fails. Restore.
2. In `withoutVersions`, drop the `used.has` filter, so every portrait is kept. The portrait tests fail. Restore.
3. In `v2.ts`, drop `.strict()` on `version`. Only the "a version" row fails. Restore.
4. Add `import { layoutV2Schema } from './layout/v2.js';` to `cloudDocument.ts`. `npm run lint` errors with the layout message. Remove it.

- [ ] **Step 11: Commit**

```bash
git add src/data/remote/layout src/data/remote/cloudDocument.ts src/data/remote/cloudDocument.test.ts src/data/remote/codec.ts src/data/remote/codec.test.ts eslint.config.js
git commit -m "feat(data): cloud layout 2, and uploads and deletes applied in memory"
```

---

### Task 4: The Firestore store, its rules and indexes, and emulator tests

**Files:**
- Create:
  - `src/data/remote/cloudStore.ts`
  - `src/data/remote/cloudStore.emulator.test.ts`
  - `firebase.test.json`
  - `firestore.indexes.json`
- Modify:
  - `firestore.rules`
  - `firebase.json`
  - `vite.config.ts`
  - `package.json`
  - `.github/workflows/deploy.yml`
  - `src/data/remote/types.ts`, adding `CloudLoad` only; `CloudRepository` changes in Task 5

**Interfaces:**
- Consumes:
  - `parseCloudDocument`, `CURRENT_LAYOUT`, `CloudDocument` (Task 3)
  - `withoutVersions`, `withVersion`, `NewVersion`, `cloudDocumentPath`, `cloudDocumentSize` (Task 3)
  - `MAX_DOCUMENT_BYTES` (Task 2)
- Produces:
  - `types.ts`: `type CloudLoad = { ok: true; doc: CloudDocument | null } | { ok: false; error: LoadError }`
  - `cloudStore.ts`: `createCloudStore(db: Firestore, uid: () => string): CloudStore`, where:

```ts
interface CloudStore {
  /** The whole document, parsed. `doc: null` when the player has never uploaded. */
  load(): Promise<CloudLoad>;
  /** One merge write. Never reads. */
  upload(characterId: string, uploadedAt: string, version: NewVersion): Promise<void>;
  /** One transaction: read, `withoutVersions`, delete the removed paths. Returns what is left. */
  deleteVersions(characterId: string, uploadedAts: readonly string[] | null): Promise<CloudLoad>;
}
```

- [ ] **Step 1: Let Vitest run emulator tests only on request**

`vite.config.ts`:
- Change `export default defineConfig({ ... })` to `export default defineConfig(({ mode }) => ({ ... }))`.
- Add `configDefaults` to the `vitest/config` import.
- In `test`:

```ts
    // `npm run test:rules` runs `vitest --mode emulator` inside `firebase emulators:exec`. That is
    // the only way the emulator tests run: plain `npm test` has no emulator to talk to.
    include:
      mode === 'emulator' ? ['src/**/*.emulator.test.ts'] : ['src/**/*.test.{ts,tsx}'],
    exclude:
      mode === 'emulator'
        ? configDefaults.exclude
        : [...configDefaults.exclude, 'src/**/*.emulator.test.ts'],
```

Check that vitest 4's CLI `--mode` reaches this function: `npx vitest run --mode emulator` with no emulator test files yet should report "No test files found". If it doesn't, stop and report; do not invent a workaround.

`firebase.test.json`. Its own port, so a running `npm run dev:cloud` (8080) is not disturbed:

```json
{
  "firestore": { "rules": "firestore.rules" },
  "emulators": {
    "singleProjectMode": true,
    "firestore": { "port": 8181 },
    "ui": { "enabled": false }
  }
}
```

In `package.json` scripts:

```json
"test:rules": "firebase emulators:exec --config firebase.test.json --project dnd-character-sheet-64a24 --only firestore \"vitest run --mode emulator\"",
```

**Windows:** `emulators:exec` has been seen leaving its `java` process listening on 8181 after it exits. If the next run says "port taken", stop that process: PowerShell `Stop-Process -Id (Get-NetTCPConnection -LocalPort 8181 -State Listen).OwningProcess`.

- [ ] **Step 2: Write the failing emulator tests**

`src/data/remote/cloudStore.emulator.test.ts`:

```ts
import { initializeApp, setLogLevel } from 'firebase/app';
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  type Firestore,
} from 'firebase/firestore/lite';
import { beforeEach, describe, expect, it } from 'vitest';
import { ID_A, ID_B } from '../../test/fixtures.js';
import { cloudDocumentSize, withVersion, type NewVersion } from './cloudDocument.js';
import { createCloudStore } from './cloudStore.js';
import { MAX_DOCUMENT_BYTES } from './size.js';

setLogLevel('silent');

const PROJECT = 'dnd-character-sheet-64a24';
const [HOST = '127.0.0.1', PORT = '8181'] = (
  process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8181'
).split(':');
const EMULATOR = `http://${HOST}:${PORT}`;
const T1 = '2026-09-25T10:00:00.000Z';
const T2 = '2026-09-25T11:00:00.000Z';
const H1 = '1'.repeat(64);

let apps = 0;
/** A client signed in as `uid`: the emulator trusts a mock token, so no Auth emulator is needed. */
function as(uid: string): Firestore {
  const db = getFirestore(initializeApp({ projectId: PROJECT, apiKey: 'emulator' }, `app${apps++}`));
  connectFirestoreEmulator(db, HOST, Number(PORT), { mockUserToken: { sub: uid, user_id: uid } });
  return db;
}
const storeAs = (uid: string) => createCloudStore(as(uid), () => uid);

/** Writes past the rules, as the seed script does. The app never sends this header. */
async function adminPatch(path: string, fields: object): Promise<void> {
  const url = `${EMULATOR}/v1/projects/${PROJECT}/databases/(default)/documents/${path}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
}

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => 'allowed',
    (caught: { code?: string }) => caught.code,
  );

const sheet = (n: number) => new Uint8Array(n).fill(7);
const plain = (n: number): NewVersion => ({ sheet: sheet(n), portrait: null });
const pictured = (n: number): NewVersion => ({
  sheet: sheet(n),
  portrait: { hash: H1, bytes: new Uint8Array([9]) },
});

beforeEach(async () => {
  await fetch(`${EMULATOR}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: 'DELETE',
  });
});

describe('cloudStore against the emulator and the real rules', () => {
  it('uploads, loads the bytes back, and deletes', async () => {
    const store = storeAs('u1');
    await store.upload(ID_A, T1, plain(3));
    expect(await store.load()).toEqual({
      ok: true,
      doc: { layoutVersion: 2, characters: { [ID_A]: { [T1]: { sheet: sheet(3), portrait: null } } } },
    });
    expect(await store.deleteVersions(ID_A, [T1])).toEqual({
      ok: true,
      doc: { layoutVersion: 2, characters: {} },
    });
    expect((await store.load()).ok).toBe(true);
  });

  it('an upload without a portrait keeps the portraits already stored', async () => {
    const store = storeAs('u1');
    await store.upload(ID_A, T1, pictured(1));
    await store.upload(ID_A, T2, plain(1));
    const loaded = await store.load();
    expect(loaded.ok && Object.keys(loaded.doc?.portraits ?? {})).toEqual([H1]);
    expect(loaded.ok && Object.keys(loaded.doc?.characters[ID_A] ?? {})).toEqual([T1, T2]);
  });

  it('two devices uploading at once both keep their version', async () => {
    await Promise.all([storeAs('u1').upload(ID_A, T1, plain(1)), storeAs('u1').upload(ID_A, T2, plain(1))]);
    const loaded = await storeAs('u1').load();
    expect(loaded.ok && Object.keys(loaded.doc?.characters[ID_A] ?? {}).sort()).toEqual([T1, T2]);
  });

  it('a delete decides from what it reads, not from what the caller last listed', async () => {
    // Another device uploads a version with the same portrait after this one's last load.
    const here = storeAs('u1');
    await here.upload(ID_A, T1, pictured(1));
    await storeAs('u1').upload(ID_B, T1, pictured(1));
    const left = await here.deleteVersions(ID_A, null);
    expect(left.ok && Object.keys(left.doc?.portraits ?? {})).toEqual([H1]);
  });

  it("refuses another account's reads and writes", async () => {
    await storeAs('u1').upload(ID_A, T1, plain(1));
    const eve = as('eve');
    expect(await refusal(getDoc(doc(eve, 'cloud', 'u1')))).toBe('permission-denied');
    expect(await refusal(createCloudStore(eve, () => 'u1').upload(ID_A, T2, plain(1)))).toBe(
      'permission-denied',
    );
  });

  it('refuses every other path, including the old layout', async () => {
    const db = as('u1');
    expect(await refusal(setDoc(doc(db, 'users', 'u1', 'characters', ID_A), { versions: {} }))).toBe(
      'permission-denied',
    );
    expect(await refusal(setDoc(doc(db, 'cloud', 'u1', 'extra', 'x'), { a: 1 }))).toBe(
      'permission-denied',
    );
  });

  it('refuses a wrong layoutVersion, an extra field, and a delete of the document', async () => {
    const db = as('u1');
    const ref = doc(db, 'cloud', 'u1');
    expect(await refusal(setDoc(ref, { layoutVersion: 3, characters: {} }))).toBe('permission-denied');
    expect(await refusal(setDoc(ref, { layoutVersion: 2, characters: {}, junk: 1 }))).toBe(
      'permission-denied',
    );
    await storeAs('u1').upload(ID_A, T1, plain(1));
    expect(await refusal(deleteDoc(ref))).toBe('permission-denied');
  });

  it('refuses an old build writing over a newer layout', async () => {
    await adminPatch('cloud/u1', { layoutVersion: { integerValue: '3' } });
    expect(await refusal(storeAs('u1').upload(ID_A, T1, plain(1)))).toBe('permission-denied');
  });

  it('reports a newer layout on load and on delete, and deletes nothing', async () => {
    await adminPatch('cloud/u1', { layoutVersion: { integerValue: '3' } });
    const store = storeAs('u1');
    expect(await store.load()).toMatchObject({ ok: false, error: { code: 'FROM_FUTURE' } });
    expect(await store.deleteVersions(ID_A, null)).toMatchObject({ ok: false });
  });

  it('refuses a write exactly where size.ts puts the limit', async () => {
    // Four versions, so no single field comes near Firestore's separate 1,048,487-byte field cap.
    async function fill(uid: string, extra: number) {
      const store = storeAs(uid);
      for (const [index, at] of [T1, T2, '2026-09-25T12:00:00.000Z'].entries()) {
        await store.upload(ID_A, at, plain(300_000 + index));
      }
      const loaded = await store.load();
      if (!loaded.ok) throw new Error('unreadable');
      const last = '2026-09-25T13:00:00.000Z';
      const empty = cloudDocumentSize(uid, withVersion(loaded.doc, ID_A, last, plain(0)));
      return store.upload(ID_A, last, plain(MAX_DOCUMENT_BYTES - empty + extra));
    }
    expect(await refusal(fill('exact', 0))).toBe('allowed');
    expect(await refusal(fill('over', 1))).toBe('failed-precondition');
  });
});
```

Add `CloudLoad` to `src/data/remote/types.ts`, beside the existing types:

```ts
import type { LoadError } from '../migration/errors.js';
import type { CloudDocument } from './layout/index.js';

/** The cloud document, read. `doc: null`: this player has never uploaded. */
export type CloudLoad = { ok: true; doc: CloudDocument | null } | { ok: false; error: LoadError };
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npm run test:rules`
Expected: FAIL, because `cloudStore.js` does not exist.

- [ ] **Step 4: Implement the store**

`src/data/remote/cloudStore.ts`:

```ts
import {
  Bytes,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  runTransaction,
  setDoc,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore/lite';
import { cloudDocumentPath, withoutVersions, type NewVersion } from './cloudDocument.js';
import { CURRENT_LAYOUT, parseCloudDocument } from './layout/index.js';
import type { CloudLoad } from './types.js';

/** Firestore hands back `Bytes`. The layout speaks `Uint8Array`, so it is tested without the SDK. */
function fromFirestore(value: unknown): unknown {
  if (value instanceof Bytes) return value.toUint8Array();
  if (Array.isArray(value)) return value.map(fromFirestore);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, fromFirestore(v)]));
  }
  return value;
}

function toLoad(snapshot: DocumentSnapshot): CloudLoad {
  if (!snapshot.exists()) return { ok: true, doc: null };
  const parsed = parseCloudDocument(fromFirestore(snapshot.data()));
  return parsed.ok ? { ok: true, doc: parsed.value } : { ok: false, error: parsed.error };
}

export type CloudStore = ReturnType<typeof createCloudStore>;

/** The player's one cloud document (cloud-quota spec §2, §4). `uid` is read per call. */
export function createCloudStore(db: Firestore, uid: () => string) {
  const ref = () => doc(db, ...cloudDocumentPath(uid()));

  return {
    load: async (): Promise<CloudLoad> => toLoad(await getDoc(ref())),

    upload: (characterId: string, uploadedAt: string, version: NewVersion): Promise<void> =>
      setDoc(
        ref(),
        {
          layoutVersion: CURRENT_LAYOUT,
          // Absent, never `{}`: merging an empty map replaces the stored one (spec §4).
          ...(version.portrait === null
            ? {}
            : { portraits: { [version.portrait.hash]: Bytes.fromUint8Array(version.portrait.bytes) } }),
          characters: {
            [characterId]: {
              [uploadedAt]: {
                sheet: Bytes.fromUint8Array(version.sheet),
                portrait: version.portrait?.hash ?? null,
              },
            },
          },
        },
        // Adds these keys and leaves every other: two devices uploading at once both land.
        { merge: true },
      ),

    deleteVersions: (characterId: string, uploadedAts: readonly string[] | null): Promise<CloudLoad> =>
      // A transaction, so a portrait another device starts using mid-delete is not removed:
      // the commit fails on the changed document and this runs again on the new one.
      runTransaction(db, async (transaction) => {
        const loaded = toLoad(await transaction.get(ref()));
        // Unreadable or newer: nothing is written to a document this build cannot read.
        if (!loaded.ok || loaded.doc === null) return loaded;
        const { doc: after, removed } = withoutVersions(loaded.doc, characterId, uploadedAts);
        const [first, ...rest] = removed.map((path) => new FieldPath(...path));
        if (first !== undefined) {
          transaction.update(ref(), first, deleteField(), ...rest.flatMap((path) => [path, deleteField()]));
        }
        return { ok: true, doc: after };
      }),
  };
}
```

Check each `firebase/firestore/lite` export against `node_modules/@firebase/firestore/dist/lite/index.d.ts`:
- `runTransaction`
- `Transaction.update`'s variadic `(ref, field, value, ...moreFieldsAndValues)` overload
- `DocumentSnapshot.exists`

`Bytes.fromUint8Array` wants a `Uint8Array`. If TypeScript objects to `ArrayBufferLike`, copy with `new Uint8Array(...)` rather than casting.

`firestore.rules`, replacing the whole file:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // One document per player (cloud-quota spec §6). Everything else, including layout 1's
    // `users/{uid}/…`, is denied by default.
    match /cloud/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow create, update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['layoutVersion', 'portraits', 'characters'])
        && request.resource.data.layoutVersion == 2
        // An old build must not merge `layoutVersion: 2` into a newer layout's document.
        && (resource == null || resource.data.layoutVersion == 2);
    }
  }
}
```

`firestore.indexes.json`:

```json
{
  "indexes": [],
  "fieldOverrides": [
    { "collectionGroup": "cloud", "fieldPath": "characters", "indexes": [] },
    { "collectionGroup": "cloud", "fieldPath": "portraits", "indexes": [] }
  ]
}
```

In `firebase.json`, change `"firestore": { "rules": "firestore.rules" }` to `"firestore": { "rules": "firestore.rules", "indexes": "firestore.indexes.json" }`.

The index file's format cannot be checked locally, because the emulator ignores indexes. The first CI deploy on `main` is its check. Record that in the commit body.

- [ ] **Step 5: Run the emulator tests**

Run: `npm run test:rules`
Expected: PASS, 10 tests. Then run `npm test`: the emulator file must **not** run there.

- [ ] **Step 6: Prove the rules bite**

One at a time, restoring after each, run `npm run test:rules`:
1. Delete the `hasOnly` line. Only "refuses a wrong layoutVersion, an extra field…" fails.
2. Delete `&& (resource == null || resource.data.layoutVersion == 2)`. Only "refuses an old build…" fails.
3. Change `request.auth.uid == uid` to `request.auth != null` in the write rule. Only "refuses another account's…" fails.
4. In `cloudStore.ts`, write `portraits: {}` when there is no portrait. Only "an upload without a portrait keeps…" fails.

Report each result.

- [ ] **Step 7: Run the rules tests in CI and deploy the indexes**

In `.github/workflows/deploy.yml`, after `- run: npm test`:

```yaml
      # The emulator needs Java. Runs on every PR, and before the rules deploy on main.
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
      - run: npm run test:rules
```

In the rules deploy step, change `--only firestore:rules` to `--only firestore:rules,firestore:indexes`. Change its comment to: `# Needs the deploy service account to hold "Firebase Rules Admin", and possibly "Cloud Datastore Index Admin" for the indexes.`

- [ ] **Step 8: Commit**

```bash
npm test && npm run typecheck && npm run lint
git add src/data/remote/cloudStore.ts src/data/remote/cloudStore.emulator.test.ts src/data/remote/types.ts firebase.test.json firestore.indexes.json firestore.rules firebase.json vite.config.ts package.json .github/workflows/deploy.yml
git commit -m "feat(data): the cloud as one Firestore document, with rules and emulator tests" -m "The index overrides are not checked by the emulator; the first deploy on main is their check."
```

`firestoreRepository.ts` still uses the old layout until Task 5. Nothing is deployed from this branch before merge.

---

### Task 5: `CloudBackup` on the single document

**Files:**
- Modify:
  - `src/data/remote/types.ts`, the new `CloudRepository`
  - `src/data/remote/firestoreRepository.ts`
  - `src/data/remote/cloudError.ts`, `src/data/remote/cloudError.test.ts`
  - `src/business/cloudBackup.ts`, `src/business/cloudBackup.test.ts`
  - `src/ui/bind.ts`, a stopgap mapping only; Task 6 replaces it

**Interfaces:**
- Consumes: everything from Tasks 2–4, plus `decodePayload`, `encodePayload`, `portraitHash` from `codec.ts`.
- Produces:
  - `CloudRepository` in `types.ts`:
    - `currentUser()`, `signIn()`, `signOut()`: unchanged
    - `load(): Promise<CloudLoad>`
    - `upload(characterId: string, uploadedAt: string, version: NewVersion): Promise<void>`
    - `deleteVersions(characterId: string, uploadedAts: readonly string[] | null): Promise<CloudLoad>`
    - The old `CloudVersion` / `CloudCharacter` types are **removed** from `types.ts`.
  - `cloudError.ts`:
    - `describeLayoutError(error: LoadError): string`
    - `describeFull(neededBytes: number, freeBytes: number): string`
  - `cloudBackup.ts`, exported through `src/business/index.ts` under the same names as today:

```ts
export interface CloudVersion {
  uploadedAt: string;
  /** This version's own entry. A portrait it shares with others is counted in `usedBytes` only. */
  bytes: number;
  /** What its sheet says, or `null` when it cannot be read and `problem` says why. */
  sheet: { name: string; classes: { name: string; level: number }[]; totalLevel: number; sheetUpdatedAt: string } | null;
  problem: string | null;
  fromNewerApp: boolean;
}
export interface CloudCharacter { characterId: string; versions: CloudVersion[] } // newest first
// CloudBackup gains `usedBytes: number` and `readonly limitBytes = MAX_DOCUMENT_BYTES`,
// and loses `totalBytes` and `schemaVersion`.
```

- [ ] **Step 1: Write the failing error tests**

Add to `src/data/remote/cloudError.test.ts`:

```ts
  it('describes a cloud document from a newer layout, and any other that will not load', () => {
    expect(describeLayoutError({ code: 'FROM_FUTURE', found: 3, current: 2 })).toBe(
      'Your cloud backups were made by a newer version of the app. Reload to update.',
    );
    expect(describeLayoutError({ code: 'UNVERSIONED' })).toBe(
      'Your cloud backups could not be read. Nothing in the cloud was changed.',
    );
  });

  it('says how much a version needs and how much is free', () => {
    expect(describeFull(19_600, 12_000)).toBe(
      'Not enough cloud space: this version needs 19.6 KB and 12.0 KB is free. Delete old versions on the Cloud screen to make room.',
    );
    expect(describeFull(19_600, -5)).toMatch(/and 0\.0 KB is free/);
  });
```

Implement both in `cloudError.ts`, importing `formatBytes` from `../../shared/formatBytes.js` and `type LoadError` from `../migration/errors.js`:

```ts
export function describeLayoutError(error: LoadError): string {
  return error.code === 'FROM_FUTURE'
    ? 'Your cloud backups were made by a newer version of the app. Reload to update.'
    : 'Your cloud backups could not be read. Nothing in the cloud was changed.';
}

export function describeFull(neededBytes: number, freeBytes: number): string {
  return `Not enough cloud space: this version needs ${formatBytes(neededBytes)} and ${formatBytes(Math.max(0, freeBytes))} is free. Delete old versions on the Cloud screen to make room.`;
}
```

Run `npx vitest run src/data/remote/cloudError.test.ts`: it fails first, then passes.

- [ ] **Step 2: Change the repository interface and the Firestore repository**

In `src/data/remote/types.ts`, replace `CloudVersion`, `CloudCharacter` and the data methods of `CloudRepository`:

```ts
import type { NewVersion } from './cloudDocument.js';

export interface CloudRepository {
  // currentUser, signIn, signOut: unchanged, with their doc comments.
  /** The player's whole cloud document (spec §4). */
  load(): Promise<CloudLoad>;
  /** One merge write, no read. Over the limit, Firestore refuses it. */
  upload(characterId: string, uploadedAt: string, version: NewVersion): Promise<void>;
  /** One transaction. `null` deletes every version. Unreadable documents are returned, not written. */
  deleteVersions(characterId: string, uploadedAts: readonly string[] | null): Promise<CloudLoad>;
}
```

In `firestoreRepository.ts`:
- Delete `entrySchema`, `indexSchema`, `BATCH`, `indexRef`, `payloadRef`, and the four old data methods, along with their now-unused imports (`Bytes`, `collection`, `deleteField`, `FieldPath`, `getDoc`, `getDocs`, `writeBatch`, `z`).
- Build the store once: `const store = createCloudStore(db, uid);`.
- Return `{ currentUser, signIn, signOut, load: () => guard(store.load), upload: (...args) => guard(() => store.upload(...args)), deleteVersions: (...args) => guard(() => store.deleteVersions(...args)) }`.
- Keep `guard` so every failure is still a `CloudError`.

- [ ] **Step 3: Rewrite the test fake, and write the failing business tests**

In `src/business/cloudBackup.test.ts`, replace `fakeCloud` with this fake. It holds the raw document, as Firestore would, and parses it with the real layout:

```ts
import { cloudDocumentSize, withoutVersions, withVersion } from '../data/remote/cloudDocument.js';
import { parseCloudDocument } from '../data/remote/layout/index.js';
import { MAX_DOCUMENT_BYTES } from '../data/remote/size.js';
import type { CloudLoad, CloudRepository, CloudUser } from '../data/remote/types.js';

function fakeCloud(signedIn = true) {
  const state = {
    user: signedIn ? USER : null,
    failNext: null as unknown,
    redirectFailure: null as CloudError | null,
    /** The document as Firestore holds it; `undefined` until the first upload. */
    stored: undefined as unknown,
    uploads: 0,
    loads: 0,
    signIns: 0,
  };
  const check = () => {
    const failure = state.failNext;
    state.failNext = null;
    if (failure) throw failure;
    if (state.user === null) throw new CloudError('SIGNED_OUT');
  };
  const read = (): CloudLoad => {
    if (state.stored === undefined) return { ok: true, doc: null };
    const parsed = parseCloudDocument(state.stored);
    return parsed.ok ? { ok: true, doc: parsed.value } : { ok: false, error: parsed.error };
  };

  const repository: CloudRepository = {
    currentUser: async () => {
      const failure = state.redirectFailure;
      state.redirectFailure = null;
      if (failure) throw failure;
      return state.user;
    },
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
    load: async () => {
      check();
      state.loads += 1;
      return read();
    },
    upload: async (characterId, uploadedAt, version) => {
      check();
      const current = read();
      // The rules refuse a write over a newer layout.
      if (!current.ok) throw new CloudError('PERMISSION_DENIED');
      const after = withVersion(current.doc, characterId, uploadedAt, version);
      if (cloudDocumentSize(USER.uid, after) > MAX_DOCUMENT_BYTES) {
        // What the emulator answers (spec §5); production's code may differ, which is the point.
        throw Object.assign(new Error('maximum entity size is 1048576 bytes'), {
          code: 'failed-precondition',
        });
      }
      state.uploads += 1;
      state.stored = after;
    },
    deleteVersions: async (characterId, uploadedAts) => {
      check();
      const current = read();
      if (!current.ok || current.doc === null) return current;
      const { doc } = withoutVersions(current.doc, characterId, uploadedAts);
      state.stored = doc;
      return { ok: true, doc };
    },
  };
  return { repository, state };
}
```

Add helpers under `clock()`:

```ts
/** Lists first, as the cloud screen does, so an upload lands in the list. */
async function uploaded(cloudBackup: CloudBackup, id = ID_A): Promise<string> {
  await cloudBackup.refresh();
  const result = await cloudBackup.upload(id);
  if (!result.ok) throw new Error(result.message);
  return result.uploadedAt;
}

const PORTRAIT = `data:image/jpeg;base64,${btoa('\xff\xd8\xff\xe0 not really a jpeg \xff\xd9')}`;
const AT = '2026-09-25T10:00:00.000Z';
```

**Update the existing tests:**

- **"uploads one version…"** Call `await cloudBackup.refresh()` first. Replace the index/payload assertions with:
  - `expect(Object.keys((cloud.state.stored as CloudDocument).characters[ID_A]!)).toHaveLength(1)`
  - `expect(cloudBackup.characters[0]?.versions[0]?.sheet).toMatchObject({ name: 'Sable', totalLevel: 0 })`
- **"uploads the edit made a moment ago…"** Decode `(cloud.state.stored as CloudDocument).characters[ID_A]![result.uploadedAt]!.sheet` with `decodePayload({ sheet, portrait: null }, ID_A)`.
- **Every restore test.** Replace `(await cloudBackup.upload(ID_A)) as { uploadedAt: string }` with `await uploaded(cloudBackup)`.
- **"asks before overwriting a stored character that the list does not show"** and **"answers a local read that fails during a restore"**. These build a second `CloudBackup` over the same fake, so call `await thatBackup.refresh()` on it before restoring. Restore now reads from the listing.
- **"reports a version from a newer app and stores nothing"** becomes:

```ts
  it('lists a version from a newer app flagged, and refuses to restore it', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const future = await encodePayload(
      { ...docFor(ID_A, 'Future'), schemaVersion: 99 } as unknown as CharacterDocument,
      null,
    );
    cloud.state.stored = {
      layoutVersion: 2,
      characters: { [ID_A]: { [AT]: { sheet: future.sheet, portrait: null } } },
    };
    await library.entries[0]!.remove();

    expect(await cloudBackup.refresh()).toBeNull();
    const version = cloudBackup.characters[0]!.versions[0]!;
    expect(version).toMatchObject({ sheet: null, fromNewerApp: true });
    expect(version.problem).toMatch(/newer version/);
    expect(await cloudBackup.restore(ID_A, AT)).toMatchObject({ ok: false, kind: 'failed' });
    expect(library.entries).toEqual([]);
  });
```

- **The four delete tests.**
  - Replace `cloud.index` / `cloud.payloads` with reads of `cloud.state.stored as CloudDocument`.
  - "deleting the last version removes the character from the cloud": `expect((cloud.state.stored as CloudDocument).characters).toEqual({})`.
  - Each needs `await cloudBackup.refresh()` before deleting, via `uploaded()`.
- **"adds up the usage"** becomes:

```ts
  it('shows usage as the cloud document’s size, out of 1 MiB', async () => {
    const { backup: cloudBackup, cloud } = backup();
    await uploaded(cloudBackup);
    await cloudBackup.upload(ID_A);
    expect(cloudBackup.limitBytes).toBe(1_048_576);
    expect(cloudBackup.usedBytes).toBe(cloudDocumentSize(USER.uid, cloud.state.stored as CloudDocument));
    const [first] = cloudBackup.characters[0]!.versions;
    await cloudBackup.deleteVersion(ID_A, first!.uploadedAt);
    expect(cloudBackup.usedBytes).toBe(cloudDocumentSize(USER.uid, cloud.state.stored as CloudDocument));
  });
```

**Add these tests:**

```ts
  it('restores from the listing, downloading nothing more', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const at = await uploaded(cloudBackup);
    await library.entries[0]!.remove();
    const loads = cloud.state.loads;
    expect(await cloudBackup.restore(ID_A, at)).toEqual({ ok: true, id: ID_A });
    expect(cloud.state.loads).toBe(loads);
  });

  it('an upload before the cloud was listed waits for the next listing', async () => {
    const { backup: cloudBackup } = backup();
    expect((await cloudBackup.upload(ID_A)).ok).toBe(true);
    expect(cloudBackup.characters).toEqual([]);
    await cloudBackup.refresh();
    expect(cloudBackup.characters[0]?.versions).toHaveLength(1);
  });

  it('lists a damaged sheet flagged, not dropped, and it can still be deleted', async () => {
    const { backup: cloudBackup, cloud } = backup();
    cloud.state.stored = {
      layoutVersion: 2,
      characters: { [ID_A]: { [AT]: { sheet: new Uint8Array([1, 2, 3]), portrait: null } } },
    };
    await cloudBackup.refresh();
    expect(cloudBackup.characters[0]!.versions[0]).toMatchObject({ sheet: null, fromNewerApp: false });
    expect(cloudBackup.characters[0]!.versions[0]!.problem).toMatch(/damaged/);
    expect(await cloudBackup.deleteVersion(ID_A, AT)).toBeNull();
    expect(cloudBackup.characters).toEqual([]);
  });

  it('flags a version whose portrait is missing from the cloud', async () => {
    const { backup: cloudBackup, cloud } = backup();
    const { sheet } = await encodePayload(docFor(ID_A, 'Sable'), null);
    cloud.state.stored = {
      layoutVersion: 2,
      characters: { [ID_A]: { [AT]: { sheet, portrait: 'f'.repeat(64) } } },
    };
    await cloudBackup.refresh();
    expect(cloudBackup.characters[0]!.versions[0]!.problem).toBe('Its portrait is missing from the cloud.');
  });

  it('reports a cloud from a newer layout, and changes nothing in it', async () => {
    const { backup: cloudBackup, cloud } = backup();
    cloud.state.stored = { layoutVersion: 3 };
    const sentence = 'Your cloud backups were made by a newer version of the app. Reload to update.';
    expect(await cloudBackup.refresh()).toBe(sentence);
    expect(await cloudBackup.deleteCharacter(ID_A)).toBe(sentence);
    expect(cloud.state.stored).toEqual({ layoutVersion: 3 });
  });

  it('stores a portrait once for two versions that share it', async () => {
    await repository.savePortrait(ID_A, PORTRAIT);
    const { backup: cloudBackup, cloud } = backup();
    await uploaded(cloudBackup);
    const before = cloudBackup.usedBytes;
    await cloudBackup.upload(ID_A);
    const stored = cloud.state.stored as CloudDocument;
    expect(Object.keys(stored.portraits ?? {})).toHaveLength(1);
    expect(cloudBackup.usedBytes - before).toBe(cloudBackup.characters[0]!.versions[0]!.bytes);
  });

  it('keeps a portrait another version uses, and removes it with its last user', async () => {
    await repository.savePortrait(ID_A, PORTRAIT);
    const { backup: cloudBackup, cloud } = backup();
    const first = await uploaded(cloudBackup);
    const second = (await cloudBackup.upload(ID_A)) as { uploadedAt: string };
    await cloudBackup.deleteVersion(ID_A, first);
    expect(Object.keys((cloud.state.stored as CloudDocument).portraits ?? {})).toHaveLength(1);
    await cloudBackup.deleteVersion(ID_A, second.uploadedAt);
    expect((cloud.state.stored as CloudDocument).portraits).toEqual({});
  });

  it('Delete all versions also removes one another device uploaded since', async () => {
    const cloud = fakeCloud();
    const { backup: here } = backup(cloud);
    await uploaded(here);
    const elsewhere = new CloudBackup(library, {
      load: async () => cloud.repository,
      now: clock(Date.parse('2026-09-25T18:00:00.000Z')),
    });
    await elsewhere.upload(ID_A);
    expect(await here.deleteCharacter(ID_A)).toBeNull();
    expect((cloud.state.stored as CloudDocument).characters).toEqual({});
  });

  it('says how much space an upload needs when the cloud is full, even unlisted', async () => {
    const { backup: cloudBackup, cloud } = backup();
    cloud.state.stored = {
      layoutVersion: 2,
      characters: { [ID_B]: { [AT]: { sheet: new Uint8Array(MAX_DOCUMENT_BYTES - 200), portrait: null } } },
    };
    const result = await cloudBackup.upload(ID_A); // no refresh: straight from a sheet
    expect(result).toEqual({
      ok: false,
      message: expect.stringMatching(
        /^Not enough cloud space: this version needs [\d.]+ KB and [\d.]+ KB is free\./,
      ) as unknown,
    });
  });

  it('an unexplained upload failure that is not about space keeps its own sentence', async () => {
    const { backup: cloudBackup, cloud } = backup();
    cloud.state.failNext = Object.assign(new Error('boom'), { code: 'internal' });
    expect(await cloudBackup.upload(ID_A)).toEqual({
      ok: false,
      message: 'Cloud backup failed unexpectedly. Try again.',
    });
  });

  it('after signing out, nothing of that account can be restored', async () => {
    const { backup: cloudBackup } = backup();
    const at = await uploaded(cloudBackup);
    await cloudBackup.signOut();
    expect(cloudBackup.usedBytes).toBe(0);
    expect(await cloudBackup.restore(ID_A, at)).toEqual({
      ok: false,
      kind: 'failed',
      message: 'This version is no longer in the cloud.',
    });
  });
```

Keep "deleting the last version this list knows of keeps one another device uploaded since". Change only its assertions, to `expect(Object.keys((cloud.state.stored as CloudDocument).characters[ID_A]!)).toEqual([other.uploadedAt])`, and call `await here.refresh()` before `here.upload`.

Imports:
- Remove the `CloudVersion` / `CloudCharacter` data-type imports and `Payload`.
- Add `type CloudDocument` from `../data/remote/layout/index.js`.
- Add `encodePayload` beside `decodePayload` from `../data/remote/codec.js`.
- Add `ID_B` to the fixtures import.

- [ ] **Step 4: Run them to verify they fail**

Run: `npx vitest run src/business/cloudBackup.test.ts`
Expected: FAIL, with type errors against the old `CloudBackup`, and the new behaviours missing.

- [ ] **Step 5: Implement `CloudBackup`**

Changes to `src/business/cloudBackup.ts`, keeping everything not named here as it is. That includes `checkSignIn`, `signIn`, the busy flag, `#repo`, `#signedInUser`, and the flush-then-read of the stored character.

- **Types.** Define `CloudVersion` and `CloudCharacter` as in Interfaces, and export them. `export type { CloudUser }` stays.
- **Symbol.** Rename `RESTORE_REFUSED` to `REFUSED`, with the comment "Marks a failure whose message is already the sentence to show". Add `const refused = (message: string) => new Error(message, { cause: REFUSED });`.
- **Private state:**

```ts
type Decoded =
  | { ok: true; doc: CharacterDocument; portrait: string | null }
  | { ok: false; problem: string; fromNewerApp: boolean };
/** The last document read, and whether one has been read since sign-in: an upload is only listed on top of a real listing. */
#doc: CloudDocument | null = null;
#listed = false;
/** Every listed version, decoded. Keyed `${characterId}/${uploadedAt}`; a version never changes, so a key never goes stale. */
#decoded = new Map<string, Decoded>();
```

- **Observable state.** Add `usedBytes: 0` to `#state`, with a getter. Add `readonly limitBytes = MAX_DOCUMENT_BYTES;`. Delete `totalBytes`, `schemaVersion`, and the `CURRENT` import.
- **Module-level decode:**

```ts
async function decodeVersion(
  doc: CloudDocument,
  characterId: string,
  version: CloudVersionData,
): Promise<Decoded> {
  const portrait = version.portrait === null ? null : doc.portraits?.[version.portrait];
  if (portrait === undefined) {
    return { ok: false, problem: 'Its portrait is missing from the cloud.', fromNewerApp: false };
  }
  const result = await decodePayload({ sheet: version.sheet, portrait }, characterId);
  if (result.ok) return result;
  return result.kind === 'corrupt'
    ? { ok: false, problem: `This cloud version is damaged. ${result.message}`, fromNewerApp: false }
    : {
        ok: false,
        problem: describeLoadError(result.error),
        fromNewerApp: result.error.code === 'FROM_FUTURE',
      };
}
```

- **`#apply`**, which rebuilds the list and usage from a document:

```ts
  async #apply(doc: CloudDocument | null, uid: string): Promise<void> {
    const decoded = new Map<string, Decoded>();
    const characters: CloudCharacter[] = [];
    for (const [characterId, versions] of Object.entries(doc?.characters ?? {})) {
      const list: CloudVersion[] = [];
      for (const [uploadedAt, version] of Object.entries(versions)) {
        const key = `${characterId}/${uploadedAt}`;
        const entry = this.#decoded.get(key) ?? (await decodeVersion(doc!, characterId, version));
        decoded.set(key, entry);
        list.push({
          uploadedAt,
          bytes: stringSize(uploadedAt) + valueSize(version),
          sheet: entry.ok ? summaryOf(entry.doc) : null,
          problem: entry.ok ? null : entry.problem,
          fromNewerApp: !entry.ok && entry.fromNewerApp,
        });
      }
      // ISO 8601 with milliseconds sorts lexically in time order.
      list.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      characters.push({ characterId, versions: list });
    }
    this.#doc = doc;
    this.#listed = true;
    this.#decoded = decoded;
    this.#state.characters = characters;
    this.#state.usedBytes = doc === null ? 0 : cloudDocumentSize(uid, doc);
  }
```

  `summaryOf` is a module function beside `decodeVersion`:

```ts
/** The local list's own summary (`summarize`), plus the time the conflict dialog compares. */
function summaryOf(doc: CharacterDocument): NonNullable<CloudVersion['sheet']> {
  const { name, classes, totalLevel } = summarize(doc, null);
  return { name, classes, totalLevel, sheetUpdatedAt: doc.updatedAt };
}
```

- **`#run`** passes the signed-in uid:

```ts
  async #run(action: (repository: CloudRepository, uid: string) => Promise<void>): Promise<string | null> {
    // …unchanged busy handling…
      const uid = this.#state.user?.uid;
      if (uid === undefined) throw new CloudError('SIGNED_OUT');
      await action(repository, uid);
    // …
  }
```

- **`refresh()`**, when signed in:

```ts
    return this.#run(async (repository, uid) => {
      const loaded = await repository.load();
      if (!loaded.ok) throw refused(describeLayoutError(loaded.error));
      await this.#apply(loaded.doc, uid);
    });
```

- **`#upload`.** After `encodePayload`:

```ts
      const version: NewVersion = {
        sheet: payload.sheet,
        portrait:
          payload.portrait === null
            ? null
            : { hash: await portraitHash(payload.portrait), bytes: payload.portrait },
      };
      const uploadedAt = this.#now().toISOString();
      try {
        await repository.upload(characterId, uploadedAt, version);
      } catch (caught) {
        return { ok: false, message: await this.#uploadFailure(caught, repository, user.uid, characterId, uploadedAt, version) };
      }
      if (this.#listed) {
        this.#decoded.set(`${characterId}/${uploadedAt}`, { ok: true, doc: stored.doc, portrait });
        await this.#apply(withVersion(this.#doc, characterId, uploadedAt, version), user.uid);
      }
      return { ok: true, uploadedAt };
```

- **`#uploadFailure`:**

```ts
  /** Spec §5: the numbers decide "full", never the error code, which production may word differently. */
  async #uploadFailure(
    caught: unknown,
    repository: CloudRepository,
    uid: string,
    characterId: string,
    uploadedAt: string,
    version: NewVersion,
  ): Promise<string> {
    if (toCloudError(caught).code === 'UNKNOWN') {
      try {
        const loaded = await repository.load();
        if (loaded.ok) {
          const before = loaded.doc === null ? 0 : cloudDocumentSize(uid, loaded.doc);
          const after = cloudDocumentSize(uid, withVersion(loaded.doc, characterId, uploadedAt, version));
          if (after > MAX_DOCUMENT_BYTES) return describeFull(after - before, MAX_DOCUMENT_BYTES - before);
        }
      } catch {
        // The upload's own failure is the one to report.
      }
    }
    return this.#describe(caught);
  }
```

- **`restore`** makes no repository call:

```ts
  async restore(characterId: string, uploadedAt: string, choice?: RestoreChoice): Promise<RestoreResult> {
    const failed = (message: string): RestoreResult => ({ ok: false, kind: 'failed', message });
    const entry = this.#decoded.get(`${characterId}/${uploadedAt}`);
    if (entry === undefined) return failed(describeCloudError(new CloudError('NOT_FOUND')));
    if (!entry.ok) return failed(entry.problem);
    if (this.#state.busy) return failed(BUSY);
    this.#state.busy = true;
    try {
      // A copy: the library may give it a new id (Keep both), and this one stays listed.
      return await this.#library.restore(structuredClone(entry.doc), entry.portrait, choice);
    } catch (caught) {
      return failed(this.#describe(caught));
    } finally {
      this.#state.busy = false;
    }
  }
```

- **Deletes:**

```ts
  deleteVersion(characterId: string, uploadedAt: string): Promise<string | null> {
    return this.#delete(characterId, [uploadedAt]);
  }

  /** Every version in the cloud, including one another device uploaded since this list was read. */
  deleteCharacter(characterId: string): Promise<string | null> {
    return this.#delete(characterId, null);
  }

  #delete(characterId: string, uploadedAts: readonly string[] | null): Promise<string | null> {
    return this.#run(async (repository, uid) => {
      const loaded = await repository.deleteVersions(characterId, uploadedAts);
      if (!loaded.ok) throw refused(describeLayoutError(loaded.error));
      await this.#apply(loaded.doc, uid);
    });
  }
```

- **`signOut`.** Also reset `this.#doc = null`, `this.#listed = false`, `this.#decoded = new Map()` and `this.#state.usedBytes = 0`.
- **Cleanup.** Delete `#addVersion`, and the `summarize` / `CloudVersion`-building code in `#upload`.
- **Imports:**
  - from `'../data/remote/cloudDocument.js'`: `cloudDocumentSize`, `withVersion`, `type NewVersion`
  - from `'../data/remote/layout/index.js'`: `type CloudDocument`, `type CloudVersionData`
  - from `'../data/remote/size.js'`: `MAX_DOCUMENT_BYTES`, `stringSize`, `valueSize`
  - from `'../data/schema/index.js'`: `type CharacterDocument`
  - `describeFull` and `describeLayoutError` from `cloudError.js`
  - `portraitHash` from `codec.js`

- [ ] **Step 6: Map the new state into the existing view (stopgap until Task 6)**

In `src/ui/bind.ts` `toCloudView`, so the screen compiles unchanged:

```ts
    characters: cloud.characters.flatMap(({ characterId, versions }) => {
      const newest = versions.find((version) => version.sheet !== null) ?? versions[0];
      if (newest === undefined) return [];
      return [
        {
          characterId,
          name: newest.sheet?.name ?? 'Unreadable character',
          level: newest.sheet?.totalLevel ?? 0,
          versions: versions.map((version) => ({
            uploadedAt: version.uploadedAt,
            sheetUpdatedAt: version.sheet?.sheetUpdatedAt ?? version.uploadedAt,
            name: version.sheet?.name ?? 'Unreadable character',
            level: version.sheet?.totalLevel ?? 0,
            bytes: version.bytes,
            fromNewerApp: version.fromNewerApp,
          })),
        },
      ];
    }),
    totalBytes: cloud.usedBytes,
```

- [ ] **Step 7: Run everything**

Run: `npm test && npm run typecheck && npm run lint && npm run test:rules`
Expected: PASS.

- [ ] **Step 8: Prove it bites**

One at a time, restoring after each:
1. In `signOut`, skip `this.#decoded = new Map()`. Only "after signing out, nothing of that account can be restored" fails.
2. In `#uploadFailure`, return `this.#describe(caught)` straight away. Only "says how much space…" fails.
3. In `restore`, call `repository.load()` first. Only "restores from the listing, downloading nothing more" fails.
4. In `#apply`, skip versions whose decode failed. The damaged, portrait-missing and newer-app listing tests fail.

- [ ] **Step 9: Commit**

```bash
git add src/data/remote/types.ts src/data/remote/firestoreRepository.ts src/data/remote/cloudError.ts src/data/remote/cloudError.test.ts src/business/cloudBackup.ts src/business/cloudBackup.test.ts src/ui/bind.ts
git commit -m "feat(business): cloud backup over one document: usage, shared portraits, restore from the listing"
```

---

### Task 6: The cloud screen: usage out of the limit, and flagged versions

**Before starting:** `git fetch` and look at `origin/main`. Another session was editing `src/ui/screens/CloudScreen.tsx` and its test, adding Terms and Privacy links. If that has landed, rebase this branch onto `origin/main` first. If it is still uncommitted elsewhere, go ahead and expect a merge conflict in those two files later.

**Files:**
- Modify:
  - `src/ui/types.ts`
  - `src/ui/bind.ts`
  - `src/ui/screens/CloudScreen.tsx`, `src/ui/screens/CloudScreen.test.tsx`, `src/ui/screens/CloudScreen.stories.tsx`
  - `src/ui/styles.css`, only if the warning needs a class it lacks: `.cvwarn` exists

**Interfaces:**
- Consumes: `CloudBackup.usedBytes`, `limitBytes`, `CloudVersion` (Task 5).
- Produces, in `ui/types.ts`:

```ts
export interface CloudVersionView {
  uploadedAt: string;
  /** `null` when the sheet cannot be read: `problem` then says why, and Restore is disabled. */
  sheetUpdatedAt: string | null;
  name: string | null;
  level: number | null;
  bytes: number;
  fromNewerApp: boolean;
  problem: string | null;
}
export interface CloudCharacterView {
  characterId: string;
  /** The newest readable version's; `null` when none is readable. */
  name: string | null;
  level: number | null;
  versions: CloudVersionView[];
}
export interface CloudView {
  status: 'unknown' | 'signedOut' | 'signingIn' | 'signedIn' | 'unavailable';
  user: { name: string | null; email: string | null } | null;
  characters: CloudCharacterView[];
  usedBytes: number;
  limitBytes: number;
  busy: boolean;
}
```

- [ ] **Step 1: Write the failing screen tests**

In `CloudScreen.test.tsx`:
- In `signedIn`, replace `totalBytes: 3_400_000` with `usedBytes: 312_400, limitBytes: 1_048_576`.
- Add `problem: null` to both versions.
- On the second version, set `fromNewerApp: true, problem: 'This file was written by a newer version of the app (schema 2, this build understands 1). Update the app to open it.'`.

Replace "shows the account and the usage" with:

```ts
  it('shows the account and the usage out of the limit', () => {
    renderScreen(signedIn);
    expect(screen.getByText(/ja@example\.com/)).toBeTruthy();
    expect(screen.getByText('312.4 KB')).toBeTruthy();
    expect(screen.getByText('of 1.0 MB')).toBeTruthy();
    expect(screen.getByText('ID: c1')).toBeTruthy();
  });
```

Add:

```ts
  it('flags an unreadable version with its reason, and will not restore it', () => {
    const view: CloudView = {
      ...signedIn,
      characters: [
        {
          characterId: 'c1',
          name: null,
          level: null,
          versions: [
            {
              uploadedAt: '2026-09-30T20:11:05.002Z',
              sheetUpdatedAt: null,
              name: null,
              level: null,
              bytes: 3,
              fromNewerApp: false,
              problem: 'This cloud version is damaged. incorrect header check',
            },
          ],
        },
      ],
    };
    renderScreen(view);
    expect(screen.getByRole('heading', { name: 'Unreadable character' })).toBeTruthy();
    expect(screen.getByText(/This cloud version is damaged/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Restore' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /^Delete version/ })).toBeTruthy();
  });
```

"flags a version from a newer app" stays as it is. It must still find `/newer version of the app/`, which the short "Made by a newer version of the app" line keeps.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/ui/screens/CloudScreen.test.tsx`
Expected: FAIL, with type errors and the missing texts.

- [ ] **Step 3: Implement**

- **`ui/types.ts`:** as in Interfaces.
- **`bind.ts` `toCloudView`**, replacing Task 5's stopgap:

```ts
    characters: cloud.characters.flatMap(({ characterId, versions }) => {
      if (versions.length === 0) return [];
      const newest = versions.find((version) => version.sheet !== null);
      return [
        {
          characterId,
          name: newest?.sheet?.name ?? null,
          level: newest?.sheet?.totalLevel ?? null,
          versions: versions.map((version) => ({
            uploadedAt: version.uploadedAt,
            sheetUpdatedAt: version.sheet?.sheetUpdatedAt ?? null,
            name: version.sheet?.name ?? null,
            level: version.sheet?.totalLevel ?? null,
            bytes: version.bytes,
            fromNewerApp: version.fromNewerApp,
            problem: version.problem,
          })),
        },
      ];
    }),
    usedBytes: cloud.usedBytes,
    limitBytes: cloud.limitBytes,
```

- **`CloudScreen.tsx`:**
  - Usage:

```tsx
                <span className="cusage">
                  <span className="cusagev">{formatBytes(view.usedBytes)}</span>
                  <span className="mdesc">of {formatBytes(view.limitBytes)}</span>
                </span>
```

  - Card title: `{character.name ?? 'Unreadable character'}`. In the `ConfirmDelete` `what`, use the same fallback.
  - Version meta: render the Level / edited parts only when `version.sheetUpdatedAt !== null`, and always the size. Then:

```tsx
                        {version.fromNewerApp ? (
                          <span className="cvwarn">Made by a newer version of the app</span>
                        ) : (
                          version.problem !== null && <span className="cvwarn">{version.problem}</span>
                        )}
```

  - Restore: `disabled={view.busy || version.sheetUpdatedAt === null}`.
- **`CloudScreen.stories.tsx`:**
  - `totalBytes: 78_000` becomes `usedBytes: 78_000, limitBytes: 1_048_576`.
  - Add `problem: null` to each version.
  - In the SignedOut story, `totalBytes: 0` becomes `usedBytes: 0, limitBytes: 1_048_576`.
  - Add a `Damaged` story whose one version has `sheetUpdatedAt: null, name: null, level: null, problem: 'This cloud version is damaged. incorrect header check'`.

- [ ] **Step 4: Run everything**

Run: `npm test && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Prove it bites**

Remove `|| version.sheetUpdatedAt === null` from Restore's `disabled`. Only "flags an unreadable version…" fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/ui/types.ts src/ui/bind.ts src/ui/screens/CloudScreen.tsx src/ui/screens/CloudScreen.test.tsx src/ui/screens/CloudScreen.stories.tsx
git commit -m "feat(ui): cloud usage out of 1 MB, and unreadable versions flagged"
```

---

### Task 7: Seed the emulator in layout 2, and verify in a browser

**Files:**
- Modify: `scripts/seedEmulator.mjs`

- [ ] **Step 1: Rewrite the seed for one document**

Replace `seedVersion` and its callers. Keep `seedPlayer`, `call`, `string`, `integer`, and the Zahir / older fixtures.

Update the top doc comment's layout paragraph to: "The document is laid out exactly as `src/data/remote/cloudStore.ts` writes it: `cloud/{uid}` holding `{ layoutVersion: 2, characters: { [id]: { [uploadedAt]: { sheet, portrait: null } } } }`, the sheet gzipped as Bytes. If that layout changes, change this with it."

```js
const bytesValue = (buffer) => ({ bytesValue: buffer.toString('base64') });
const map = (fields) => ({ mapValue: { fields } });

/** Every version in one write: layout 2 is one document per player. */
async function seedCloud(uid, versions) {
  const byCharacter = {};
  for (const { doc, uploadedAt } of versions) {
    byCharacter[doc.id] ??= {};
    byCharacter[doc.id][uploadedAt] = map({
      sheet: bytesValue(gzipSync(JSON.stringify(doc))),
      portrait: { nullValue: null },
    });
  }
  const characters = Object.fromEntries(
    Object.entries(byCharacter).map(([id, entries]) => [id, map(entries)]),
  );
  await call(`${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/cloud/${uid}`, 'PATCH', {
    fields: { layoutVersion: integer(2), characters: map(characters) },
  });
}

await seedPlayer();
await seedCloud(PLAYER.localId, [
  { doc: older, uploadedAt: '2026-09-16T21:00:00.000Z' },
  { doc: zahir, uploadedAt: '2026-09-23T15:00:00.000Z' },
]);
console.log(`Seeded ${PLAYER.displayName} <${PLAYER.email}> with ${zahir.name} (2 versions).`);
```

Remove `string` if it is now unused (lint will say).

- [ ] **Step 2: Verify in a real browser**

The manual end-to-end check the spec asks for.

1. Run `npm run dev:cloud`.
2. In Chromium, open the app, open the Cloud screen, and sign in as Dev Player. Confirm:
   - Zahir is listed with two versions, levels differing by one.
   - The header reads "… KB" / "of 1.0 MB".
3. Restore the older version. Choose Keep both. Confirm the copy appears in the list.
4. Open a character, set a portrait, and press Upload to cloud twice. On the Cloud screen, confirm usage grew by about one sheet the second time, not by a sheet plus a portrait.
5. Delete one of those two versions, then Delete all versions for that character. Confirm the usage drops each time.
6. **Measure the listing cost** (spec §4). In DevTools Performance, record opening the Cloud screen with the seeded data, and note the time spent in decoding. Report the number. If it is over 200 ms on the desktop, say so rather than optimising: it is a finding for the spec.

- [ ] **Step 3: Commit**

```bash
npm run lint
git add scripts/seedEmulator.mjs
git commit -m "chore(dev): seed the emulator in cloud layout 2"
```

---

### Task 8: Docs

**Files:**
- Modify:
  - `AGENTS.md`
  - `docs/superpowers/specs/2026-09-24-cloud-backup-design.md`
  - `docs/superpowers/specs/2026-09-25-cloud-quota-design.md`
  - `docs/BACKLOG.md`

- [ ] **Step 1: AGENTS.md**

In the "Cloud backup" entry of Current state, replace the layout-dependent facts:

- **One document per player, `cloud/{uid}`, layout 2.** See `docs/superpowers/specs/2026-09-25-cloud-quota-design.md`. Its 1 MiB document limit is the quota. The cloud screen shows "Using X of 1.0 MB", computed by `src/data/remote/size.ts`, which agrees with the emulator at the limit.
- **Layout versioning.** `src/data/remote/layout/` is versioned like `src/data/schema/`: one strict file per version, `index.ts` the only way in (lint-enforced), parsed by the same `parseVersioned` walk as characters.
- **Uploads never write an empty map.** Merging `portraits: {}` wipes every stored portrait.
- **`npm run test:rules`.** It runs the emulator tests (`*.emulator.test.ts`) against the real `firestore.rules`, on port 8181, and in CI. On Windows, `emulators:exec` can leave `java` listening on 8181; stop it if the next run says "port taken".
- **Still to do by hand after the first deploy:** delete the `users` collection (layout 1) in the console, and check that the index overrides deployed.

Add `test:rules` to the Commands block. Update the Map entries for `src/data/remote/` and `src/data/migration/`, including the new files.

- [ ] **Step 2: Record what the build changed**

- **`2026-09-24-cloud-backup-design.md`.** Under its first paragraph, add: "**§3–§5 are superseded** by `2026-09-25-cloud-quota-design.md`, which also amends §6–§11."
- **`2026-09-25-cloud-quota-design.md`.** Add "## 13. Deviations found while building", listing at least:
  - "Full" is a sentence from `describeFull`, not a `CloudError('FULL')` code. Nothing branches on it.
  - Delete all versions now also removes versions uploaded elsewhere since the list was read, which retires cloud-backup §10's fourth risk.
  - §9's "a delete transaction racing an upload" is tested deterministically instead, as "a delete decides from what it reads, not from what the caller last listed". A real race cannot be forced from a test. Firestore lite's retry on a changed document was confirmed separately, by a probe: the transaction ran twice.
  - Anything else the build decided, with the reason.
- **`docs/BACKLOG.md` Done.** Add: "**Cloud quota and portrait deduplication.** 1 MiB per player, one versioned document — `docs/superpowers/specs/2026-09-25-cloud-quota-design.md`."

- [ ] **Step 3: Commit**

```bash
npx prettier --check .
git add AGENTS.md docs/superpowers/specs docs/BACKLOG.md
git commit -m "docs: cloud quota, layout versioning, and test:rules"
```
