# Data Layer Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure schema v1 to give every collection item a stable id and replace its name-keyed maps with arrays, and finish the repository's deferred storage-failure and testability work, so the business layer can be built on top.

**Architecture:** Schema v1 is edited in place — nothing has shipped and no real data exists, so the freeze in `src/data/schema/README.md` has not begun and no migration function is written. Name-keyed maps (`classes`, `Categorized.categories`) become arrays of `{ id, name, … }`, which deletes the key-equals-name rule, both one-pass rename rebuilds, and the numeric-name ordering quirk rather than relocating them. The repository gains typed storage failures, an injectable opener and migration registry.

**Tech Stack:** TypeScript 6 (strict), Zod 4.4.3, `idb` 8, Vitest 4, `fake-indexeddb` 6, ESLint 10 (flat config), Prettier 3.

**Spec:** `docs/superpowers/specs/2026-09-20-business-layer-design.md` — §2 (schema restructure) and §7 (data-layer work folded in). The older `2026-07-25-dnd-character-sheet-design.md` remains authoritative for everything this spec does not amend.

## Global Constraints

- **Every commit must leave `npm test`, `npm run typecheck` and `npm run lint` green**, and `npx prettier --check .` passing.
- **Prove every new test bites.** Break the thing it guards, watch that test and only that test fail, then restore. Two tests in the original build shipped vacuous and were only caught this way.
- **Verify APIs against the installed version, never from memory.** Zod 4.4.3, TypeScript 6 and `idb` 8 all have breaking changes from earlier majors. Guessing produced wrong code three times during the initial build.
- **Schema v1 is edited in place.** No `v2/` directory, no migration function. `MIGRATIONS` stays empty.
- **`src/data/schema/index.ts` is the only entry point outside `schema/`.** It must not begin exporting `ABILITY_KEYS`, `SKILL_KEYS`, `SPELL_SLOT_LEVELS` or the version-named schema.
- **Every object schema is individually `.strict()`.** `.strict()` does not cascade into a separate schema instance used as a property value. Every new object schema gets its own `.strict()` and its own row in the unknown-key table in `document.test.ts`.
- **Names are rejected when padded, never trimmed.** `shortName` and `categoryName` keep `.refine(isTrimmed)`. Trimming belongs at the business layer's write boundary.
- **IndexedDB uses out-of-line keys** — `put(value, key)`, never a `keyPath`.
- **`vitest.config.ts` pins `TZ: 'Etc/GMT+5'`.** Do not remove it.
- **Conventional Commit prefixes**, small commits, tests before implementation.
- **`.prettierignore` excludes `docs/`.** That is deliberate. Do not reformat anything under `docs/start/`.

---

### Task 1: Shared test helpers

Six test files each carry their own copy of the same `wipe()` and `createCharacter` fixture. Every later task in this plan edits fixtures, so de-duplicating first means editing one copy instead of six.

**Files:**

- Create: `src/test/fixtures.ts`
- Modify: `src/data/repository/indexedDbRepository.test.ts`, `src/data/repository/summarize.test.ts`, `src/data/characterLifecycle.test.ts`, `src/data/serialization/exportCharacter.test.ts`, `src/data/serialization/importCharacter.test.ts`, `src/data/migration/parseCharacter.test.ts`
- Test: no new test file — this task is proved by the existing suite staying green

**Interfaces:**

- Consumes: `createCharacter` from `src/data/schema/index.js`, `DB_NAME` from `src/data/repository/indexedDbRepository.js`
- Produces: `ID_A`, `ID_B`, `FIXED_NOW`, `docFor(id, name)`, `wipe()` — used by every later task's tests

- [ ] **Step 1: Create the shared helper module**

```ts
// src/test/fixtures.ts
import { createCharacter, type CharacterDocument } from '../data/schema/index.js';
import { DB_NAME } from '../data/repository/indexedDbRepository.js';

export const ID_A = '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e';
export const ID_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
export const FIXED_NOW = new Date('2026-07-25T09:41:00.000Z');

export function docFor(id: string, name: string): CharacterDocument {
  return createCharacter({ name, id, now: FIXED_NOW });
}

/**
 * Deletes the database between tests. Rejects rather than resolves on `blocked`: blocked means
 * an open connection is holding the database, so the delete has NOT happened and may complete
 * later, mid-test, wiping the store out from under whatever is running. Resolving there turned
 * a leaked connection into an intermittent, far-away failure; rejecting fails loudly at the leak.
 */
export async function wipe(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error('deleteDatabase was blocked — a connection was left open by a test'));
  });
}
```

- [ ] **Step 2: Replace the duplicated copies**

In each of the six files listed above, delete the local `wipe`, `docFor`, `ID_A`/`ID_B` and fixed-date constants and import them instead:

```ts
import { ID_A, ID_B, FIXED_NOW, docFor, wipe } from '../../test/fixtures.js';
```

Adjust the relative depth per file (`../test/fixtures.js` from `src/data/`). Leave `putRaw` where it is — Task 7 rewrites it.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS, all 203 tests. A failure here means a fixture differed between copies in a way that mattered — investigate rather than adjusting the shared helper to suit one caller.

- [ ] **Step 4: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: both clean.

- [ ] **Step 5: Commit**

```bash
git add src/test/fixtures.ts src/data
git commit -m "test: share the wipe and character fixtures across the data layer"
```

---

### Task 2: `classes` becomes an array

**Files:**

- Modify: `src/data/schema/v1/document.ts`, `src/data/schema/v1/blank.ts`, `src/data/repository/summarize.ts`
- Test: `src/data/schema/v1/document.test.ts`, `src/data/schema/v1/blank.test.ts`, `src/data/repository/summarize.test.ts`

**Interfaces:**

- Consumes: `uuid`, `shortName`, `nonNegativeInt` from `./primitives.js`
- Produces: `classes: { id: string; name: string; level: number }[]` on `CharacterDocumentV1`. Task 5 reads `doc.classes.map(c => c.id)`; the business plan's `ClassesBO` reads this array directly.

- [ ] **Step 1: Write the failing tests**

In `src/data/schema/v1/document.test.ts`, change the fixture's `classes` to an array and add two cases:

```ts
// in validDocument()
classes: [
  { id: '11111111-1111-4111-8111-111111111111', name: 'Rogue', level: 5 },
  { id: '22222222-2222-4222-8222-222222222222', name: 'Wizard', level: 2 },
],
```

```ts
it('requires an id on every class', () => {
  const doc = validDocument();
  delete (doc.classes[0] as Record<string, unknown>).id;
  expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
});

it('preserves class order through a JSON round trip, so display order needs no order array', () => {
  const doc = validDocument();
  const parsed = characterDocumentV1Schema.parse(JSON.parse(JSON.stringify(doc)));
  expect(parsed.classes.map((entry) => entry.name)).toEqual(['Rogue', 'Wizard']);
});

it('accepts two classes sharing a name, which the business layer rejects rather than the schema', () => {
  const doc = validDocument();
  doc.classes[1]!.name = 'Rogue';
  expect(characterDocumentV1Schema.safeParse(doc).success).toBe(true);
});
```

Delete the two tests that no longer have a referent: `'rejects a class whose map key disagrees with its name (spec §3.3)'` and `'rejects a class key with leading/trailing whitespace (shortName as a record key)'`. Their rule is gone because the structure that needed it is gone.

In the unknown-key table, change the `'a class entry'` case to `(doc) => { (doc.classes[0] as Record<string, unknown>).extra = 'x'; }`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/data/schema/v1/document.test.ts`
Expected: FAIL — the fixture no longer matches `z.record(shortName, classItem)`.

- [ ] **Step 3: Change the schema**

In `src/data/schema/v1/document.ts`:

```ts
const classItem = z.object({ id: uuid, name: shortName, level: nonNegativeInt }).strict();
```

```ts
  classes: z.array(classItem),
```

and replace the exported schema, dropping the `superRefine` entirely — it exists only to keep a map key in step with its value, and there is no longer a map key:

```ts
export const characterDocumentV1Schema = documentShape.strict();
```

- [ ] **Step 4: Update the blank factory and the summary**

`src/data/schema/v1/blank.ts`:

```ts
    classes: [],
```

`src/data/repository/summarize.ts`:

```ts
  const classes = doc.classes.map(({ name, level }) => ({ name, level }));
```

- [ ] **Step 5: Update the remaining test expectations**

`src/data/schema/v1/blank.test.ts` — the blank document's `classes` is now `[]` rather than `{}`.
`src/data/repository/summarize.test.ts` — build `classes` as an array of `{ id, name, level }`.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Prove the new tests bite**

Temporarily make `classItem`'s `id` optional (`id: uuid.optional()`); confirm only `'requires an id on every class'` fails. Restore it. Then temporarily change `classes` to `z.array(classItem).min(3)`; confirm the round-trip test fails. Restore.

- [ ] **Step 8: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint && npx prettier --check .
git add src/data
git commit -m "feat: make classes an array of identified entries

Deletes the key-equals-name superRefine and the rename rebuild it forced.
Two classes may now share a name; the business layer rejects that, not the
schema, so a hand-edited document is never rejected over it."
```

---

### Task 3: `Categorized<T>` becomes categories-as-array

**Files:**

- Modify: `src/data/schema/v1/primitives.ts`, `src/data/schema/v1/document.ts`, `src/data/schema/v1/blank.ts`
- Test: `src/data/schema/v1/primitives.test.ts`, `src/data/schema/v1/document.test.ts`, `src/data/schema/v1/blank.test.ts`

**Interfaces:**

- Consumes: `uuid`, `categoryName`, `nameAndDescription` from `./primitives.js`
- Produces: `{ categories: { id: string; name: string; items: T[] }[]; uncategorized: T[] }` for `featsAndTraits`, `spellList` and `counters`. The business plan's `CategorizedBO`/`CategoryBO` wrap exactly this shape.

- [ ] **Step 1: Write the failing tests**

In `src/data/schema/v1/primitives.test.ts`:

```ts
describe('categorized', () => {
  const schema = categorized(z.object({ id: uuid, name: shortName }).strict());
  const item = { id: '33333333-3333-4333-8333-333333333333', name: 'Rage' };
  const valid = () => ({
    categories: [{ id: '44444444-4444-4444-8444-444444444444', name: 'Combat', items: [item] }],
    uncategorized: [] as unknown[],
  });

  it('accepts categories as an ordered array', () => {
    expect(schema.safeParse(valid()).success).toBe(true);
  });

  it('requires an id on every category', () => {
    const value = valid();
    delete (value.categories[0] as Record<string, unknown>).id;
    expect(schema.safeParse(value).success).toBe(false);
  });

  it('rejects an unknown key on a category', () => {
    const value = valid();
    (value.categories[0] as Record<string, unknown>).extra = 'x';
    expect(schema.safeParse(value).success).toBe(false);
  });

  it('rejects a padded category name rather than trimming it', () => {
    const value = valid();
    value.categories[0]!.name = ' Combat ';
    expect(schema.safeParse(value).success).toBe(false);
  });

  it('preserves category order through a JSON round trip', () => {
    const value = valid();
    value.categories.push({
      id: '55555555-5555-4555-8555-555555555555',
      name: 'Exploration',
      items: [],
    });
    const parsed = schema.parse(JSON.parse(JSON.stringify(value)));
    expect(parsed.categories.map((c) => c.name)).toEqual(['Combat', 'Exploration']);
  });
});
```

In `src/data/schema/v1/document.test.ts`, rewrite the fixture's three categorized fields, e.g.:

```ts
featsAndTraits: {
  categories: [
    {
      id: '66666666-6666-4666-8666-666666666666',
      name: 'Combat',
      items: [
        {
          id: '77777777-7777-4777-8777-777777777777',
          name: 'Sneak Attack',
          description: 'Once per turn.',
        },
      ],
    },
  ],
  uncategorized: [],
},
```

`spellList` and `counters` take the same shape, with their own item fields:

```ts
spellList: {
  categories: [
    {
      id: '88888888-8888-4888-8888-888888888888',
      name: 'Evocation',
      items: [
        {
          id: '99999999-9999-4999-8999-999999999999',
          name: 'Fire Bolt',
          description: 'A mote of fire.',
          level: 'c' as const,
          prepared: true,
        },
      ],
    },
  ],
  uncategorized: [],
},

counters: {
  categories: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Class features',
      items: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          name: 'Rage',
          description: 'Per long rest.',
          current: 1,
          total: 3,
        },
      ],
    },
  ],
  uncategorized: [],
  spellSlots: Object.fromEntries(SPELL_SLOT_LEVELS.map((level) => [level, zero()])),
},
```

Add one more case to the primitives test, guarding the §2.5 decision at its second location:

```ts
it('accepts two categories sharing a name, which the business layer rejects rather than the schema', () => {
  const value = valid();
  value.categories.push({
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Combat',
    items: [],
  });
  expect(schema.safeParse(value).success).toBe(true);
});
```

Delete the test `'rejects a category name with leading/trailing whitespace (categoryName as a record key)'` — the primitives test above now covers the same rule at its new location. Update the unknown-key table's category-related rows to index into `categories[0]`.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/data/schema/v1`
Expected: FAIL — `categorized` still produces `z.record(...)`.

- [ ] **Step 3: Change the `categorized` helper**

In `src/data/schema/v1/primitives.ts`, replace the helper. Note both object schemas get their own `.strict()`:

```ts
/**
 * Categorized<T> (spec §3.2). Categories are an ordered array, so display order is array
 * position and a rename is a plain field write — see the 2026-09-20 business layer spec §2.2.
 */
export const categorized = <Item extends z.ZodType>(item: Item) =>
  z
    .object({
      categories: z.array(
        z
          .object({
            id: uuid,
            name: categoryName,
            items: z.array(item),
          })
          .strict(),
      ),
      uncategorized: z.array(item),
    })
    .strict();
```

- [ ] **Step 4: Give the categorized item schemas ids**

In `src/data/schema/v1/document.ts`:

```ts
const featItem = nameAndDescription.extend({ id: uuid }).strict();

const spellListItem = nameAndDescription
  .extend({
    id: uuid,
    level: spellLevel,
    prepared: z.boolean(),
  })
  .strict();

const countersItem = nameAndDescription.extend({ id: uuid, ...currentAndTotal.shape }).strict();
```

and use `featItem` for `featsAndTraits: categorized(featItem)`.

- [ ] **Step 5: Update the blank factory**

In `src/data/schema/v1/blank.ts`, `emptyCategorized` now returns an array of categories:

```ts
const emptyCategorized = <Item>() => ({
  categories: [] as { id: string; name: string; items: Item[] }[],
  uncategorized: [] as Item[],
});
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS, after updating `blank.test.ts`'s expectations for the three categorized fields.

- [ ] **Step 7: Prove the new tests bite**

Remove the inner `.strict()` from the category object; confirm only `'rejects an unknown key on a category'` fails. Restore. Replace `categoryName` with `z.string()`; confirm only the padded-name test fails. Restore.

- [ ] **Step 8: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint && npx prettier --check .
git add src/data
git commit -m "feat: make categories an ordered array of identified groups

Rename becomes a field write instead of a one-pass map rebuild, and a
category named 12 no longer sorts ahead of every other."
```

---

### Task 4: Ids on the remaining item arrays

**Files:**

- Modify: `src/data/schema/v1/document.ts`
- Test: `src/data/schema/v1/document.test.ts`

**Interfaces:**

- Consumes: `uuid` from `./primitives.js`
- Produces: `id` on every element of `inventory.items`, `equipment.weapons` and `equipment.other`

- [ ] **Step 1: Write the failing test**

```ts
it.each([
  ['inventory.items', (doc: Doc) => doc.inventory.items[0]!],
  ['equipment.weapons', (doc: Doc) => doc.equipment.weapons[0]!],
  ['equipment.other', (doc: Doc) => doc.equipment.other[0]!],
])('requires an id on every %s entry', (_location, pick) => {
  const doc = validDocument();
  delete (pick(doc) as Record<string, unknown>).id;
  expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
});
```

Add an `id` to each of those fixture entries so the document is otherwise valid. Make sure `equipment.other` has at least one entry in the fixture — if it is currently `[]`, add one.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/data/schema/v1/document.test.ts`
Expected: FAIL — three cases, each reporting success where failure was expected.

- [ ] **Step 3: Add the ids**

```ts
const inventoryItem = nameAndDescription.extend({ id: uuid, count: nonNegativeInt }).strict();

const equipmentItem = nameAndDescription
  .extend({
    id: uuid,
    attuned: z.boolean(),
    equipped: z.boolean(),
  })
  .strict();
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Prove the test bites**

Make `inventoryItem`'s `id` optional; confirm only the `inventory.items` case fails. Restore.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint && npx prettier --check .
git add src/data
git commit -m "feat: give inventory and equipment items stable ids"
```

---

### Task 5: Document-wide id uniqueness

Duplicate ids are silent corruption: edits and deletions land on the wrong item rather than failing. The raw-JSON editor makes them reachable, so the schema must reject them.

**Files:**

- Modify: `src/data/schema/v1/document.ts`
- Test: `src/data/schema/v1/document.test.ts`

**Interfaces:**

- Consumes: the array shapes from Tasks 2–4
- Produces: `characterDocumentV1Schema` rejects any document reusing an id, with the issue path pointing at the second occurrence

- [ ] **Step 1: Write the failing tests**

```ts
it('rejects the same id used twice in one collection', () => {
  const doc = validDocument();
  doc.classes[1]!.id = doc.classes[0]!.id;
  expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
});

it('rejects the same id used in two different collections', () => {
  const doc = validDocument();
  doc.inventory.items[0]!.id = doc.classes[0]!.id;
  expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
});

it('reports the duplicate at the second occurrence, not the first', () => {
  const doc = validDocument();
  doc.classes[1]!.id = doc.classes[0]!.id;
  const result = characterDocumentV1Schema.safeParse(doc);
  expect(result.success).toBe(false);
  if (result.success) return;
  expect(result.error.issues[0]!.path.join('.')).toBe('classes.1.id');
});

it('allows a character id that matches an item id, because doc.id is the store key', () => {
  const doc = validDocument();
  doc.classes[0]!.id = doc.id;
  expect(characterDocumentV1Schema.safeParse(doc).success).toBe(true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/data/schema/v1/document.test.ts`
Expected: FAIL on the first three; the fourth already passes and guards against over-reach.

- [ ] **Step 3: Implement the rule**

In `src/data/schema/v1/document.ts`, below `documentShape`:

```ts
type DocumentShape = z.infer<typeof documentShape>;

/**
 * Every id in the document, with the path it sits at. An explicit table rather than a recursive
 * walk: the walk would have to guess which string fields are ids, and the reported path would
 * lose the collection's name — which is the only part of the message that tells a player editing
 * raw JSON where to look.
 *
 * `doc.id` is deliberately absent. It is the IndexedDB store key, not a member of any collection,
 * so an item legitimately may carry the same value.
 */
function idsWithPaths(doc: DocumentShape): Array<[(string | number)[], string]> {
  const found: Array<[(string | number)[], string]> = [];

  const fromList = (path: (string | number)[], list: readonly { id: string }[]) => {
    list.forEach((entry, index) => found.push([[...path, index, 'id'], entry.id]));
  };

  const fromCategorized = (
    path: string,
    value: { categories: readonly { id: string; items: readonly { id: string }[] }[]; uncategorized: readonly { id: string }[] },
  ) => {
    value.categories.forEach((category, index) => {
      found.push([[path, 'categories', index, 'id'], category.id]);
      fromList([path, 'categories', index, 'items'], category.items);
    });
    fromList([path, 'uncategorized'], value.uncategorized);
  };

  fromList(['classes'], doc.classes);
  fromList(['inventory', 'items'], doc.inventory.items);
  fromList(['equipment', 'weapons'], doc.equipment.weapons);
  fromList(['equipment', 'other'], doc.equipment.other);
  fromCategorized('featsAndTraits', doc.featsAndTraits);
  fromCategorized('spellList', doc.spellList);
  fromCategorized('counters', doc.counters);

  return found;
}

export const characterDocumentV1Schema = documentShape.strict().superRefine((doc, ctx) => {
  const firstSeenAt = new Map<string, string>();

  for (const [path, id] of idsWithPaths(doc)) {
    const earlier = firstSeenAt.get(id);
    if (earlier === undefined) {
      firstSeenAt.set(id, path.join('.'));
      continue;
    }
    ctx.addIssue({
      code: 'custom',
      path,
      message: `duplicate id "${id}" — already used at ${earlier}`,
    });
  }
});
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Prove the tests bite**

Change `firstSeenAt.set(id, …)` to run unconditionally on every iteration (so nothing is ever reported as a duplicate); confirm the three duplicate tests fail and the `doc.id` test still passes. Restore.

- [ ] **Step 6: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint && npx prettier --check .
git add src/data
git commit -m "feat: reject duplicate ids anywhere in a character document

A duplicate id is silent corruption: edits and deletions land on the wrong
item rather than failing. The raw-JSON editor makes it reachable."
```

---

### Task 6: `toJsonText` accepts `unknown`

The repair screen must pretty-print `getRaw()`, whose type is `unknown` because the stored value failed validation. `toJsonText` currently takes `CharacterDocument`, so the one screen that most needs it cannot call it.

**Files:**

- Modify: `src/data/serialization/exportCharacter.ts`
- Test: `src/data/serialization/exportCharacter.test.ts`

**Interfaces:**

- Produces: `toJsonText(value: unknown): string`

- [ ] **Step 1: Write the failing test**

```ts
it('pretty-prints a value that failed validation, for the repair screen', () => {
  const damaged: unknown = { schemaVersion: 1, name: 'Sable', broken: true };
  expect(toJsonText(damaged)).toBe(
    `${JSON.stringify(damaged, null, 2)}\n`,
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/data/serialization/exportCharacter.test.ts`
Expected: FAIL at typecheck time — `unknown` is not assignable to `CharacterDocument`. If Vitest's transform does not surface it, `npm run typecheck` will.

- [ ] **Step 3: Widen the parameter**

```ts
/** Takes `unknown` so the repair screen can print a document that failed validation. */
export function toJsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: both pass.

- [ ] **Step 5: Commit**

```bash
git add src/data
git commit -m "feat: let toJsonText print an unvalidated value for the repair screen"
```

---

### Task 7: Typed database and an injectable opener

`openDb` is exported production surface that exists only as a test seam, and it omits `idb`'s `DBSchema` parameter so `cursor.value` enters as `any`. Both are fixed by injecting the opener.

**Files:**

- Modify: `src/data/repository/indexedDbRepository.ts`, `src/data/repository/types.ts`
- Test: `src/data/repository/indexedDbRepository.test.ts`, `src/data/characterLifecycle.test.ts`, `src/test/fixtures.ts`

**Interfaces:**

- Consumes: `MigrationRegistry`, `defaultRegistry` from `../migration/parseCharacter.js`
- Produces: `createIndexedDbRepository(options?: RepositoryOptions)`; `RepositoryOptions = { registry?: MigrationRegistry; openDb?: OpenDb }`; `type OpenDb = () => Promise<IDBPDatabase<CharacterDb>>`; `createOpener()` exported from `src/test/fixtures.ts`. `openDb` is no longer exported from the repository module.

- [ ] **Step 1: Write the failing test**

An older-schema load has never been testable. This is the coverage §9 asks for:

```ts
it('migrates a document written by an older schema version', async () => {
  const v1Doc = docFor(ID_A, 'Sable');
  // A synthetic two-version world: version 1 is the real schema, version 2 is what this
  // build claims to write, and the migration from 1 to 2 is the identity plus a version bump.
  const registry = {
    current: 2,
    schemas: {
      1: SCHEMAS[1]!,
      2: z.looseObject({ schemaVersion: z.literal(2) }),
    },
    migrations: new Map([[1, (doc: unknown) => ({ ...(doc as object), schemaVersion: 2 })]]),
  };
  const repository = createIndexedDbRepository({ registry, openDb: createOpener() });

  const db = await createOpener()();
  try {
    await db.put(CHARACTER_STORE, v1Doc, ID_A);
  } finally {
    db.close();
  }

  const loaded = await repository.get(ID_A);
  expect(loaded?.ok).toBe(true);
  expect((loaded as { doc: { schemaVersion: number } }).doc.schemaVersion).toBe(2);
});
```

Check `z.looseObject` exists in Zod 4.4.3 before relying on it; if the installed version spells it differently, use whatever that version provides for an object that tolerates extra keys.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/data/repository/indexedDbRepository.test.ts`
Expected: FAIL — `createIndexedDbRepository` takes no arguments.

- [ ] **Step 3: Type the database and accept options**

```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { defaultRegistry, parseCharacter, type LoadResult, type MigrationRegistry }
  from '../migration/parseCharacter.js';

interface CharacterDb extends DBSchema {
  /** `unknown`, not `CharacterDocument`: a stored row may predate this build's schema, or be damaged. */
  characters: { key: string; value: unknown };
}

export type OpenDb = () => Promise<IDBPDatabase<CharacterDb>>;

export interface RepositoryOptions {
  registry?: MigrationRegistry;
  openDb?: OpenDb;
}

/** Not exported: a second connection opened outside the repository is what blocks a version bump. */
const defaultOpenDb: OpenDb = () =>
  openDB<CharacterDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(CHARACTER_STORE)) {
        db.createObjectStore(CHARACTER_STORE);
      }
    },
  });

export function createIndexedDbRepository(options: RepositoryOptions = {}): CharacterRepository {
  const registry = options.registry ?? defaultRegistry;
  const openDb = options.openDb ?? defaultOpenDb;
  // …each method below now calls `openDb()` and `parseCharacter(value, registry)`
}
```

Thread `registry` into all three `parseCharacter` calls (`list`, `get`) and leave `save`'s `CURRENT_SCHEMA` validation alone — a save always writes the current version.

- [ ] **Step 4: Give the tests their own opener**

Add to `src/test/fixtures.ts`:

```ts
import { openDB } from 'idb';
import {
  CHARACTER_STORE,
  DB_NAME,
  DB_VERSION,
  type OpenDb,
} from '../data/repository/indexedDbRepository.js';

/** The tests' own opener, so the repository need not export one. */
export const createOpener = (): OpenDb => () =>
  openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(CHARACTER_STORE)) {
        db.createObjectStore(CHARACTER_STORE);
      }
    },
  });

/** Writes straight into the store, bypassing validation, to simulate damage. */
export async function putRaw(id: string, value: unknown): Promise<void> {
  const db = await createOpener()();
  try {
    await db.put(CHARACTER_STORE, value, id);
  } finally {
    db.close();
  }
}
```

Remove the local `putRaw` from `indexedDbRepository.test.ts` and the `openDb` import from both test files.

- [ ] **Step 5: Run everything**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. `cursor.value` is now `unknown` rather than `any`, so lint's `no-unsafe-*` rules should have nothing to say about it.

- [ ] **Step 6: Prove the new test bites**

Change `parseCharacter(stored, registry)` back to `parseCharacter(stored)` in `get`; confirm only the older-schema test fails. Restore.

- [ ] **Step 7: Commit**

```bash
git add src/data src/test
git commit -m "feat: inject the opener and migration registry into the repository

Retires openDb as production surface, types the store through DBSchema so
cursor.value stops entering as any, and makes an older-schema load testable
for the first time."
```

---

### Task 8: Typed storage failures

Quota-exceeded and IndexedDB-unavailable currently escape as raw `DOMException`s, and `list()` never awaits `tx.done`, so an aborted transaction with no in-flight request surfaces as an unhandled rejection instead of a rejected `list()`.

**Files:**

- Modify: `src/data/repository/types.ts`, `src/data/repository/indexedDbRepository.ts`
- Create: `src/data/repository/storageFailure.ts`
- Test: `src/data/repository/storageFailure.test.ts`, `src/data/repository/indexedDbRepository.test.ts`

**Interfaces:**

- Consumes: `SchemaIssue`, `toSchemaIssues` from `../migration/errors.js`
- Produces: `StorageFailure`, `StorageError`, `toStorageFailure(cause: unknown): StorageFailure`. The business plan's `StorageBO` holds a `StorageFailure | null`.

- [ ] **Step 1: Write the failing tests**

`src/data/repository/storageFailure.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { toStorageFailure } from './storageFailure.js';

describe('toStorageFailure', () => {
  it.each([
    ['QuotaExceededError', 'QUOTA_EXCEEDED'],
    ['InvalidStateError', 'UNAVAILABLE'],
    ['SecurityError', 'UNAVAILABLE'],
    ['UnknownError', 'UNKNOWN'],
  ])('maps a %s DOMException to %s', (name, code) => {
    expect(toStorageFailure(new DOMException('boom', name)).code).toBe(code);
  });

  it('keeps the cause, so a bug report can name the original error', () => {
    const cause = new DOMException('boom', 'InvalidStateError');
    expect(toStorageFailure(cause)).toMatchObject({ code: 'UNAVAILABLE', cause });
  });

  it('maps a non-DOMException to UNKNOWN rather than guessing', () => {
    const cause = new TypeError('not a storage problem');
    expect(toStorageFailure(cause)).toMatchObject({ code: 'UNKNOWN', cause });
  });
});
```

In `indexedDbRepository.test.ts`:

```ts
it('refuses to save an invalid document and says why', async () => {
  const repository = createIndexedDbRepository({ openDb: createOpener() });
  const damaged = { ...docFor(ID_A, 'Sable'), armorClass: -1 };

  await expect(repository.save(damaged as never)).rejects.toMatchObject({
    detail: { code: 'SAVE_REFUSED' },
  });
});

it('surfaces a quota failure from save as a typed rejection', async () => {
  const openDb = (() =>
    Promise.resolve({
      put: () => Promise.reject(new DOMException('full', 'QuotaExceededError')),
      close: () => {},
    })) as unknown as OpenDb;
  const repository = createIndexedDbRepository({ openDb });

  await expect(repository.save(docFor(ID_A, 'Sable'))).rejects.toMatchObject({
    detail: { code: 'QUOTA_EXCEEDED' },
  });
});
```

The first test replaces the existing assertion that `save` throws `CharacterLoadError` — update or delete that one, since a refused save is now a storage outcome rather than a load error.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/data/repository`
Expected: FAIL — `storageFailure.js` does not exist.

- [ ] **Step 3: Implement the taxonomy**

```ts
// src/data/repository/storageFailure.ts
import type { SchemaIssue } from '../migration/errors.js';

export type StorageFailure =
  | { code: 'QUOTA_EXCEEDED' }
  | { code: 'UNAVAILABLE'; cause: unknown }
  | { code: 'BLOCKED' }
  | { code: 'SAVE_REFUSED'; issues: SchemaIssue[] }
  | { code: 'UNKNOWN'; cause: unknown };

export class StorageError extends Error {
  constructor(readonly detail: StorageFailure) {
    super(detail.code);
    this.name = 'StorageError';
  }
}

/**
 * `InvalidStateError` and `SecurityError` are how private browsing and a blocked origin present
 * themselves; neither is retryable and both mean the same thing to a player. Anything else stays
 * UNKNOWN with its cause rather than being guessed into a category that would produce wrong advice.
 */
export function toStorageFailure(cause: unknown): StorageFailure {
  if (cause instanceof DOMException) {
    if (cause.name === 'QuotaExceededError') return { code: 'QUOTA_EXCEEDED' };
    if (cause.name === 'InvalidStateError' || cause.name === 'SecurityError') {
      return { code: 'UNAVAILABLE', cause };
    }
  }
  return { code: 'UNKNOWN', cause };
}
```

- [ ] **Step 4: Wrap every repository operation**

In `indexedDbRepository.ts`, add a helper and route all five methods through it:

```ts
async function guard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (cause) {
    if (cause instanceof StorageError) throw cause;
    throw new StorageError(toStorageFailure(cause));
  }
}
```

Change `save`'s validation failure from `CharacterLoadError` to:

```ts
      if (!result.success) {
        throw new StorageError({
          code: 'SAVE_REFUSED',
          issues: toSchemaIssues(result.error),
        });
      }
```

And in `list`, await the transaction so an abort rejects the call:

```ts
        const tx = db.transaction(CHARACTER_STORE);
        let cursor = await tx.store.openCursor();
        // …loop…
        await tx.done;
        return entries;
```

- [ ] **Step 5: Run everything**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 6: Prove the tests bite**

Make `toStorageFailure` return `{ code: 'UNKNOWN', cause }` unconditionally; confirm the quota and unavailable cases fail and the UNKNOWN cases still pass. Restore. Then remove `await tx.done`; confirm nothing fails — that is expected, and it is why the abort case needs its own test, added in Task 9.

- [ ] **Step 7: Commit**

```bash
git add src/data
git commit -m "feat: give storage failures a typed taxonomy

Quota-exceeded and IndexedDB-unavailable no longer escape as raw
DOMExceptions, a refused save reports its schema issues, and list() awaits
its transaction so an abort rejects instead of going unhandled."
```

---

### Task 9: Out-of-band failures — blocked, blocking, terminated

In an installed PWA, a second tab holding a connection blocks a version bump indefinitely, with no error anywhere. These failures arrive outside any call, so they need an observer rather than a rejection.

**Files:**

- Modify: `src/data/repository/indexedDbRepository.ts`
- Test: `src/data/repository/indexedDbRepository.test.ts`

**Interfaces:**

- Produces: `RepositoryOptions` gains `onFailure?: (failure: StorageFailure) => void`. The business plan's `StorageBO` passes its own setter here.

- [ ] **Step 1: Write the failing tests**

```ts
it('reports a blocked version bump to the failure observer', async () => {
  const failures: StorageFailure[] = [];
  // Hold a connection open at the current version, then ask for a higher one.
  const held = await createOpener()();
  const repository = createIndexedDbRepository({
    onFailure: (failure) => failures.push(failure),
    openDb: () =>
      openDB<never>(DB_NAME, DB_VERSION + 1, {
        blocked: () => failures.push({ code: 'BLOCKED' }),
      }) as never,
  });

  const pending = repository.list();
  await vi.waitFor(() => expect(failures).toContainEqual({ code: 'BLOCKED' }));
  held.close();
  await pending;
});

it('rejects list() when its transaction aborts', async () => {
  const openDb = (() =>
    Promise.resolve({
      transaction: () => ({
        store: { openCursor: () => Promise.resolve(null) },
        done: Promise.reject(new DOMException('aborted', 'AbortError')),
      }),
      close: () => {},
    })) as unknown as OpenDb;
  const repository = createIndexedDbRepository({ openDb });

  await expect(repository.list()).rejects.toMatchObject({ detail: { code: 'UNKNOWN' } });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/data/repository/indexedDbRepository.test.ts`
Expected: FAIL — `onFailure` is not an option, and the abort test fails only if Task 8's `await tx.done` was left in place. If the abort test passes immediately, Task 8's step 6 removal was not restored — restore it.

- [ ] **Step 3: Declare the callbacks**

```ts
export interface RepositoryOptions {
  registry?: MigrationRegistry;
  openDb?: OpenDb;
  /**
   * For failures that arrive outside any call: another tab pinning an old version, or the browser
   * terminating the connection. These cannot be rejections because no call is in flight.
   */
  onFailure?: (failure: StorageFailure) => void;
}
```

```ts
const makeDefaultOpenDb = (onFailure: (failure: StorageFailure) => void): OpenDb => () =>
  openDB<CharacterDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(CHARACTER_STORE)) {
        db.createObjectStore(CHARACTER_STORE);
      }
    },
    // Another tab holds an older version open; our upgrade cannot proceed until it closes.
    blocked: () => onFailure({ code: 'BLOCKED' }),
    // We are the old tab holding someone else's upgrade back.
    blocking: () => onFailure({ code: 'BLOCKED' }),
    // The browser dropped the connection, typically under storage pressure.
    terminated: () => onFailure({ code: 'UNAVAILABLE', cause: 'connection terminated' }),
  });
```

```ts
  const onFailure = options.onFailure ?? (() => {});
  const openDb = options.openDb ?? makeDefaultOpenDb(onFailure);
```

- [ ] **Step 4: Run everything**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 5: Prove the tests bite**

Remove `await tx.done` from `list()`; confirm only the abort test fails. Restore. Remove the `blocked` callback; confirm only the blocked test fails. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/data
git commit -m "feat: report blocked and terminated connections to an observer

A second tab pinning an old version used to block a bump indefinitely with
no error anywhere. Spec section 11 calls this the sharpest risk in the design."
```

---

### Task 10: Update the documentation of record

**Files:**

- Modify: `AGENTS.md`, `src/data/schema/README.md`, `docs/superpowers/plans/2026-07-25-data-layer-followups.md`

- [ ] **Step 1: Update `AGENTS.md`**

Under "Current state", record that the schema now uses ids and arrays and that the deferred storage work is done. Under "Invariants", replace the "Names are rejected when padded" example if it still shows the old map shape, and delete the sentence describing `classes` as a map if present. Add a line to "Map" for `src/test/fixtures.ts`.

- [ ] **Step 2: Update `src/data/schema/README.md`**

Add a note that v1 was restructured in place on 2026-09-20, before the freeze began, and that the freeze rule is unchanged.

- [ ] **Step 3: Strike the completed items**

In `2026-07-25-data-layer-followups.md`, mark as done: storage-level failure handling, the injectable `MigrationRegistry`, the `DBSchema` parameter, `openDb` as production surface, `toJsonText` taking `unknown`, and the duplicated fixtures and `wipe()`. Leave the rest.

- [ ] **Step 4: Verify and commit**

```bash
npm test && npm run typecheck && npm run lint
git add AGENTS.md src/data/schema/README.md docs/superpowers/plans
git commit -m "docs: record the schema restructure and the closed followups"
```

---

## What this plan does not cover

The business layer — every `*BO` class, `createId`, `RuleViolation`, `Autosave`, `CharacterFile`, `CharacterLibraryBO` and `StorageBO` — is a second plan, written once this one lands so its `*Data` aliases are derived from a schema that actually exists.

Three spec items belong to that plan rather than this one, and are deliberately absent here:

- **Trimming at the write boundary** (§3.6) — nothing in the data layer writes a name.
- **The persistence gate** (§5) — `navigator.storage` is business state.
- **Re-exporting `describeLoadError`** (§5) — it is the layer's user-facing copy and lives in `data`, which `ui` may not import, so `src/business/errors.ts` re-exports it. There is nothing to change in `data` for that.
