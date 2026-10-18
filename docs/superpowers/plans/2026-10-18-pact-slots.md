# Pact Slots Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A warlock's Pact Magic — X slots, all of one player-chosen level — stored as
`counters.pactSlots` in a new schema v5 and shown as the first row of the Spell Slots table on
Counters.

**Architecture:** `v5/` is a copy of the frozen `v4/` plus one strict object; `migrateV4ToV5`
adds an empty entry. `PactSlotsBO` subclasses the existing `SpellSlotBO`, overriding only where
`level` comes from. The UI gets one view field, three actions, a pact row, a no-slots state that
is only a button, and a dialog with two switches that zero their kind when switched off.

**Tech Stack:** TypeScript 6, Zod 4.4.3, MobX 7, React, Vitest 4 + Testing Library (jsdom),
Playwright MCP for the browser check.

**Spec:** `docs/superpowers/specs/2026-10-18-pact-slots-design.md`. Read it before starting.

## Global Constraints

- The app computes nothing: no level from warlock levels, no short-rest refill, no `current ≤ total` rule.
- Pact level is an integer **1–9**; `current` and `total` are integers **≥ 0**.
- Blank and migrated value: `{ level: 1, current: 0, total: 0 }`, **last key** in `counters`.
- `total: 0` hides a kind; nothing stores "is a warlock". Dialog switches are React state only.
- Switching a kind off sets its `total` and `current` to 0; the pact **level is left alone**. No confirmation.
- No `clear()`, no `clearSpellSlots()`, no clear action anywhere (user's decision).
- New rule code: `INVALID_SLOT_LEVEL`. Not added to `PRESENTABLE` in `bind.ts`: a `<select>` cannot produce a bad level.
- UI copy, exactly: button `Set spell slots` (no slots), heading `Spell Slots` + button `Edit` (slots), pact row label `Pact 3rd`, pact stepper label `Pact slots remaining`, dialog title `Spell slots`, switches `Pact magic` and `Spell slots`, pact fields `Level` and `Slots` (number field label `Pact slot total`), hint `Set slots per level. 0 hides the level.`
- Hub summary: `Pact 3rd 1/2 · 1st 4/4 · 2nd 1/2 · 2 more`.
- `v4/` is frozen: never edit a file under `src/data/schema/v4/`. A released migration is frozen too.
- Before every commit: `npm test`, `npm run typecheck`, `npm run lint`, `npx prettier --check .` all green.
- Shared working tree: other sessions may edit files here. Stage **only** the files your task lists, never `git add -A` / `git add .`.
- Every new test must be shown to bite: break the code it guards, watch that test (and only that test) fail, restore. AGENTS.md "Traps" explains why.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.

## Review Focus

1. **A held `PactSlotsBO` after `setLevel`** — the inherited `#level` is captured at construction; a stale read would show the old level. Pinned in Task 3 ("reads the level from the document, not from when it was handed out").
2. **Turning a switch off and closing the dialog** — the sheet must then show nothing of that kind, and reopening must show the switch off. Pinned in Task 5 (switch-off calls zero both numbers; switch state derives from data on open).
3. **A switch turned on but left at 0** — no row appears, and the switch is off on the next open; no extra state may keep it on. Pinned in Task 5 ("opens both switches off for a character with no slots").
4. **Raw-JSON key order after migration** — `pactSlots` must land last in `counters`, exactly where a blank v5 document has it. Pinned in Task 1 (blank key order) and Task 2 (migrated key order).
5. **Narrow phones** — the pact row label `Pact 3rd` plus stepper at 320px, and the level `<select>` in a 70px `.inp`. Checked by eye in Task 6 at 320px and 360px, light and dark.

---

### Task 1: Schema v5 with `counters.pactSlots`

**Files:**
- Create: `src/data/schema/v5/` (copy of `src/data/schema/v4/`: `blank.ts`, `blank.test.ts`, `document.ts`, `document.test.ts`, `index.ts`, `primitives.ts`, `primitives.test.ts`)
- Modify (only inside `v5/`): `document.ts`, `blank.ts`, `document.test.ts`, `blank.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `characterDocumentV5Schema`, `type CharacterDocumentV5`, `createCharacter` (v5), all from `src/data/schema/v5/index.js`. `CharacterDocumentV5['counters']['pactSlots']` is `{ level: number; current: number; total: number }`.

- [ ] **Step 1: Copy v4 and rename it to v5**

```bash
cp -r src/data/schema/v4 src/data/schema/v5
sed -i \
  -e 's/characterDocumentV4Schema/characterDocumentV5Schema/g' \
  -e 's/CharacterDocumentV4/CharacterDocumentV5/g' \
  -e 's/Schema v4, frozen/Schema v5, frozen/' \
  -e 's/what a v4 character document/what a v5 character document/' \
  -e "s/editing v4's meaning/editing v5's meaning/" \
  -e 's/every object schema in v4/every object schema in v5/' \
  -e 's/passes the v4 schema/passes the v5 schema/' \
  src/data/schema/v5/*.ts
```

Then make these four edits by hand (Edit tool), each in `src/data/schema/v5/`:

- `document.ts`: `schemaVersion: z.literal(4),` → `schemaVersion: z.literal(5),`
- `blank.ts`: `schemaVersion: 4,` → `schemaVersion: 5,`
- `blank.test.ts`: `expect(doc.schemaVersion).toBe(4);` → `expect(doc.schemaVersion).toBe(5);`
- `document.test.ts`: `schemaVersion: 4 as const,` → `schemaVersion: 5 as const,`, and the test

```ts
  it('requires schemaVersion to be exactly 4', () => {
    const doc = { ...validDocument(), schemaVersion: 3 };
```

becomes

```ts
  it('requires schemaVersion to be exactly 5', () => {
    const doc = { ...validDocument(), schemaVersion: 4 };
```

Check nothing version-4 is left (the only expected hits are `uuidv4`, and comments that say what v4 *added*, e.g. "which v4 added", which stay true):

Run: `grep -n "V4\|literal(4)\|schemaVersion: 4\|toBe(4)" src/data/schema/v5/*.ts`
Expected: exactly one hit — `document.test.ts`, the `schemaVersion: 4` inside "requires schemaVersion to be exactly 5".

Run: `npx vitest run src/data/schema/v5`
Expected: PASS (it is still v4's meaning under a new name).

- [ ] **Step 2: Write the failing tests**

In `src/data/schema/v5/document.test.ts`, in `validDocument()`, add `pactSlots` as the last key of `counters`, after `spellSlots`:

```ts
      spellSlots: Object.fromEntries(SPELL_SLOT_LEVELS.map((level) => [level, zero()])),
      pactSlots: { level: 3, current: 1, total: 2 },
    },
```

After the `describe.each(['successes', 'failures'] ...)` death-save block (before `it('rejects a negative armour class'`), add:

```ts
  it('requires pact slots, which v5 added', () => {
    const doc = validDocument();
    delete (doc.counters as Record<string, unknown>).pactSlots;
    expect(characterDocumentV5Schema.safeParse(doc).success).toBe(false);
  });

  describe('pact slot level', () => {
    const withLevel = (value: unknown) => {
      const doc = validDocument();
      (doc.counters.pactSlots as Record<string, unknown>).level = value;
      return doc;
    };

    it.each([1, 5, 9])('accepts %j', (value) => {
      expect(characterDocumentV5Schema.safeParse(withLevel(value)).success).toBe(true);
    });

    // The rules stop at 5th, but the app does not enforce rules: 6 to 9 are the player's call.
    it.each([0, 10, 2.5, -1, '3', null])('rejects %j: a whole number from 1 to 9', (value) => {
      expect(characterDocumentV5Schema.safeParse(withLevel(value)).success).toBe(false);
    });
  });

  it.each(['current', 'total'] as const)('rejects a negative pact slot %s', (field) => {
    const doc = validDocument();
    doc.counters.pactSlots[field] = -1;
    expect(characterDocumentV5Schema.safeParse(doc).success).toBe(false);
  });

  // Like an ordinary level (spec §3.2): the player may have more left than the total says.
  it('does not tie pact slots remaining to their total', () => {
    const doc = validDocument();
    doc.counters.pactSlots.current = 5;
    expect(characterDocumentV5Schema.safeParse(doc).success).toBe(true);
  });
```

In the `unknownKeyLocations` table, after the `"the spell-slot entry at level '1'"` row, add:

```ts
  [
    'the pact slots',
    (doc) => {
      (doc.counters.pactSlots as Record<string, unknown>).extra = 'x';
    },
  ],
```

In `src/data/schema/v5/blank.test.ts`, after `it('zeroes every spell-slot level, not just a sample', ...)`, add:

```ts
  it('starts with no pact slots, at level 1', () => {
    expect(createCharacter(INPUT).counters.pactSlots).toEqual({ level: 1, current: 0, total: 0 });
  });

  // The raw-JSON editor shows keys in this order, and `migrateV4ToV5` appends to match it.
  it('puts pact slots last in counters', () => {
    expect(Object.keys(createCharacter(INPUT).counters)).toEqual([
      'categories',
      'uncategorized',
      'spellSlots',
      'pactSlots',
    ]);
  });
```

and in the `does not share substructure between documents` `cases` array, after the `counters.spellSlots` case, add:

```ts
      {
        name: 'counters.pactSlots',
        mutate: (doc) => {
          doc.counters.pactSlots.current = 5;
        },
        read: (doc) => doc.counters.pactSlots,
        original: { level: 1, current: 0, total: 0 },
      },
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run src/data/schema/v5`
Expected: FAIL — "accepts a complete valid document" and every "accepts" case fail (unknown key `pactSlots`), and the blank tests fail (`pactSlots` undefined). Also a TypeScript error in `blank.test.ts` is fine at this point (`pactSlots` does not exist on the type yet); vitest still runs.

- [ ] **Step 4: Implement the schema and the blank document**

In `src/data/schema/v5/document.ts`, after the `deathSaves` definition, add:

```ts
/**
 * v5. A warlock's Pact Magic: every slot of one level, which the player chooses — so unlike an
 * entry in `spellSlots`, the level is stored rather than being the key. 1 to 9, the levels
 * `spellSlots` has: the rules stop at 5th, but the app does not enforce rules. `total: 0` is "no
 * pact slots", as it is for an ordinary level, so the key is always present and a character
 * without Pact Magic carries `{ level: 1, current: 0, total: 0 }`. `current` is not checked
 * against `total`, as `currentAndTotal` does not (spec §3.2). Spelled out rather than extended
 * from `currentAndTotal`, so the keys read in the order the blank document writes them.
 */
const pactSlots = z
  .object({
    level: z.number().int().min(1).max(9),
    current: nonNegativeInt,
    total: nonNegativeInt,
  })
  .strict();
```

and in `documentShape`, extend `counters`:

```ts
  counters: categorized(countersItem)
    .extend({
      spellSlots: fixedKeys(SPELL_SLOT_LEVELS, currentAndTotal),
      /** v5. Beside the nine levels, not among them: its level is a value, not a key. */
      pactSlots,
    })
    .strict(),
```

In `src/data/schema/v5/blank.ts`, in `counters`, after the `spellSlots` entry:

```ts
    counters: {
      ...emptyCategorized(),
      spellSlots: Object.fromEntries(
        SPELL_SLOT_LEVELS.map((level) => [level, zero()]),
      ) as CharacterDocument['counters']['spellSlots'],
      pactSlots: { level: 1, current: 0, total: 0 },
    },
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run src/data/schema/v5`
Expected: PASS.

- [ ] **Step 6: Prove the new tests bite**

One at a time, then restore each:
- `.min(1)` → `.min(0)`: only the `rejects 0` case fails.
- `.max(9)` → `.max(10)`: only the `rejects 10` case fails.
- drop `.strict()` from `pactSlots`: only the `the pact slots` unknown-key row fails.
- blank `level: 1` → `level: 2`: only "starts with no pact slots, at level 1" and the `counters.pactSlots` independence case fail.

- [ ] **Step 7: Full checks and commit**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`
Expected: all green (v5 is not registered yet, so nothing outside `v5/` sees it).

```bash
git add src/data/schema/v5
git commit -m "feat(schema): add v5 with pact slots

A copy of v4 whose counters gain pactSlots: { level, current, total },
last in the object. The level is stored because, unlike an ordinary slot
level, it is not the key; it is a whole number from 1 to 9. total: 0 means
no pact slots, as it does for an ordinary level, so the key is always
present and a blank document carries { level: 1, current: 0, total: 0 }.

v4 is on main and deployed, so the field needs a new version.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migrate v4 → v5 and make v5 current

**Files:**
- Create: `src/data/migration/v4ToV5.ts`, `src/data/migration/v4ToV5.test.ts`
- Modify: `src/data/migration/migrations.ts`, `src/data/schema/index.ts`, `src/test/fixtures.ts`, `src/test/fixtures.test.ts`, `src/data/repository/indexedDbRepository.test.ts`, `src/data/remote/codec.test.ts`

**Interfaces:**
- Consumes: `characterDocumentV5Schema`, `CharacterDocumentV5`, `createCharacter` from `./v5/index.js` (Task 1).
- Produces: `migrateV4ToV5: Migration`; `CURRENT === 5`; `CharacterDocument` is `CharacterDocumentV5`, so `CharacterDocument['counters']['pactSlots']` exists for every later task; `v4DocFor(id, name)` in `src/test/fixtures.ts`.

- [ ] **Step 1: Add the v4 fixture and its validity test**

In `src/test/fixtures.ts`, after `V1_OTHER_ID`, add two ids:

```ts
export const V4_WARLOCK_ID = '88888888-8888-4888-8888-888888888888';
export const V4_PACT_COUNTER_ID = '99999999-9999-4999-8999-999999999999';
```

After `v3DocFor`, add:

```ts
/**
 * A complete v4 document: `v3DocFor` with the death saves v4 added, ticked (one success, two
 * failures) rather than left at 0, plus a Warlock class and a counter the player named "Pact
 * Magic". Those two are bait: a v4 → v5 migration that filled in pact slots from either would
 * show up here. `fixtures.test.ts` checks it against `SCHEMAS[4]`.
 */
export function v4DocFor(id: string, name: string): Record<string, unknown> {
  const v3 = v3DocFor(id, name) as {
    classes: object[];
    hitPoints: object;
    counters: { uncategorized: object[] };
  };
  return {
    ...v3,
    schemaVersion: 4,
    classes: [...v3.classes, { id: V4_WARLOCK_ID, name: 'Warlock', level: 5 }],
    hitPoints: { ...v3.hitPoints, deathSaves: { successes: 1, failures: 2 } },
    counters: {
      ...v3.counters,
      uncategorized: [
        ...v3.counters.uncategorized,
        {
          id: V4_PACT_COUNTER_ID,
          name: 'Pact Magic',
          description: 'Two 3rd-level slots, back on a short rest.',
          current: 1,
          total: 2,
        },
      ],
    },
  };
}
```

In `src/test/fixtures.test.ts`, import `v4DocFor` beside the others and add:

```ts
describe('v4DocFor', () => {
  it('is a valid v4 document, so a migration test cannot pass on bad input', () => {
    expect(SCHEMAS[4]!.safeParse(v4DocFor(ID_A, 'Sable')).success).toBe(true);
  });
});
```

Run: `npx vitest run src/test/fixtures.test.ts`
Expected: PASS (v4 is already registered).

- [ ] **Step 2: Write the failing migration test**

Create `src/data/migration/v4ToV5.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CURRENT, SCHEMAS } from '../schema/index.js';
import { ID_A, v4DocFor } from '../../test/fixtures.js';
import { parseCharacter } from './parseCharacter.js';
import { migrateV4ToV5 } from './v4ToV5.js';

interface Migrated {
  schemaVersion: number;
  counters: Record<string, unknown>;
  [key: string]: unknown;
}

const NONE = { level: 1, current: 0, total: 0 };

describe('migrateV4ToV5', () => {
  it('adds empty pact slots to counters and changes nothing else', () => {
    const v4 = v4DocFor(ID_A, 'Sable');
    const v5 = migrateV4ToV5(v4) as Migrated;

    expect(v5.schemaVersion).toBe(5);
    expect(v5.counters.pactSlots).toEqual(NONE);

    // Everything the migration does not touch comes through as it was, the death saves v4 added
    // included.
    const untouched = (doc: Record<string, unknown>) => {
      const rest: Record<string, unknown> = { ...doc };
      delete rest.schemaVersion;
      const counters = { ...(rest.counters as Record<string, unknown>) };
      delete counters.pactSlots;
      rest.counters = counters;
      return rest;
    };
    expect(untouched(v5)).toEqual(untouched(v4));
  });

  it('reads neither a Warlock class nor a counter named Pact Magic', () => {
    const v4 = v4DocFor(ID_A, 'Sable') as {
      classes: { name: string }[];
      counters: { uncategorized: { name: string }[] };
    };
    // The bait is really there, so the assertion below means something.
    expect(v4.classes.map((entry) => entry.name)).toContain('Warlock');
    expect(v4.counters.uncategorized.map((entry) => entry.name)).toContain('Pact Magic');

    expect((migrateV4ToV5(v4) as Migrated).counters.pactSlots).toEqual(NONE);
  });

  it('puts pact slots last in counters, where a blank v5 document has them', () => {
    // Key order is what the raw-JSON editor shows.
    const v4 = v4DocFor(ID_A, 'Sable');
    const v5 = migrateV4ToV5(v4) as Migrated;
    expect(Object.keys(v5.counters)).toEqual([
      'categories',
      'uncategorized',
      'spellSlots',
      'pactSlots',
    ]);
    expect(Object.keys(v5)).toEqual(Object.keys(v4));
  });

  it('produces a valid v5 document', () => {
    expect(SCHEMAS[5]!.safeParse(migrateV4ToV5(v4DocFor(ID_A, 'Sable'))).success).toBe(true);
  });

  it('does not mutate its input', () => {
    const v4 = v4DocFor(ID_A, 'Sable');
    const before = structuredClone(v4);
    migrateV4ToV5(v4);
    expect(v4).toEqual(before);
  });
});

describe('parseCharacter on a v4 document', () => {
  // Asserts this step ran, not where the chain ends, so the next version does not break it.
  it('runs it through this migration on the way to the current version', () => {
    const result = parseCharacter(v4DocFor(ID_A, 'Sable'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.schemaVersion).toBe(CURRENT);
      expect(result.doc.counters.pactSlots).toEqual(NONE);
      expect(result.doc.hitPoints.deathSaves).toEqual({ successes: 1, failures: 2 });
    }
  });
});
```

Run: `npx vitest run src/data/migration/v4ToV5.test.ts`
Expected: FAIL — cannot resolve `./v4ToV5.js`.

- [ ] **Step 3: Write the migration**

Create `src/data/migration/v4ToV5.ts`:

```ts
import type { Migration } from './migrations.js';

/**
 * v4 → v5 (2026-10-18): counters gain `pactSlots`, `{ level: 1, current: 0, total: 0 }` — no
 * pact slots.
 *
 * Reads nothing else. A "Warlock" class row, or a counter the player named "Pact Magic", is the
 * player's own note, not data: the app never fills in a number the player did not enter, and a
 * migration is no exception.
 *
 * Last in `counters`, as a blank v5 document has it, so a plain spread puts it there. The walk has
 * already validated the input at v4, so `counters` is known to be an object.
 *
 * Frozen once released, like the schema it produces: cloud versions are never rewritten, so a v4
 * backup goes through this function on every restore, forever. Builds new objects rather than
 * editing its input.
 */
export const migrateV4ToV5: Migration = (input) => {
  const doc = input as Record<string, unknown> & { counters: Record<string, unknown> };
  return {
    ...doc,
    schemaVersion: 5,
    counters: { ...doc.counters, pactSlots: { level: 1, current: 0, total: 0 } },
  };
};
```

- [ ] **Step 4: Register it and make v5 current**

`src/data/migration/migrations.ts`: add `import { migrateV4ToV5 } from './v4ToV5.js';` after the v3ToV4 import, and `[4, migrateV4ToV5],` after `[3, migrateV3ToV4],`.

`src/data/schema/index.ts`:

```ts
import { z } from 'zod';
import { characterDocumentV1Schema } from './v1/index.js';
import { characterDocumentV2Schema } from './v2/index.js';
import { characterDocumentV3Schema } from './v3/index.js';
import { characterDocumentV4Schema } from './v4/index.js';
import { characterDocumentV5Schema, type CharacterDocumentV5 } from './v5/index.js';

/** The version this build writes. Bump when adding a schema version. */
export const CURRENT = 5;

/** Every historical schema, keyed by its version, for stepwise migration (spec §4). */
export const SCHEMAS: Readonly<Record<number, z.ZodType>> = {
  1: characterDocumentV1Schema,
  2: characterDocumentV2Schema,
  3: characterDocumentV3Schema,
  4: characterDocumentV4Schema,
  5: characterDocumentV5Schema,
};

/** The shape the business layer always sees. */
export type CharacterDocument = CharacterDocumentV5;
```

and further down `CURRENT_SCHEMA: z.ZodType<CharacterDocument> = characterDocumentV5Schema;`, `export { createCharacter, type CreateCharacterInput } from './v5/index.js';`, and in the trailing comment `(characterDocumentV4Schema, CharacterDocumentV4, and the older versions')` → `(characterDocumentV5Schema, CharacterDocumentV5, and the older versions')`.

- [ ] **Step 5: Extend the two whole-chain tests**

`src/data/repository/indexedDbRepository.test.ts`: import `migrateV4ToV5` from `'../migration/v4ToV5.js'` after the v3ToV4 import; in "migrates a stored v1 document with the real registry…" the expectation becomes

```ts
    expect(await repository.getRaw(ID_A)).toEqual(
      migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(v1DocFor(ID_A, 'Sable'))))),
    );
```

`src/data/remote/codec.test.ts`: same import (`'../migration/v4ToV5.js'`), and

```ts
      doc: migrateV4ToV5(migrateV3ToV4(migrateV2ToV3(migrateV1ToV2(zahir)))),
```

- [ ] **Step 6: Run everything**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`
Expected: all green. If typecheck reports a hand-built `CharacterDocument` literal somewhere missing `pactSlots`, add `pactSlots: { level: 1, current: 0, total: 0 }` as the last key of its `counters` and note the file in the commit.

- [ ] **Step 7: Prove the migration tests bite**

- In `migrateV4ToV5`, put `pactSlots` first (`{ pactSlots: …, ...doc.counters }`): only "puts pact slots last" fails.
- Remove `[4, migrateV4ToV5]` from `MIGRATIONS`: the `parseCharacter on a v4 document` test, the repository real-registry test and the codec round-trip fail.
- Make it read the bait (`level: 3, total: 2` when a class is named Warlock): the first two tests fail.
Restore each.

- [ ] **Step 8: Commit**

```bash
git add src/data/migration/v4ToV5.ts src/data/migration/v4ToV5.test.ts src/data/migration/migrations.ts \
  src/data/schema/index.ts src/test/fixtures.ts src/test/fixtures.test.ts \
  src/data/repository/indexedDbRepository.test.ts src/data/remote/codec.test.ts
git commit -m "feat(schema): migrate v4 to v5 and make v5 current

migrateV4ToV5 gives counters pactSlots: { level: 1, current: 0, total: 0 },
last in the object as a blank v5 document has it, and reads nothing else.
A Warlock class or a counter named Pact Magic is the player's note, not
data.

v4DocFor is a hand-built v4 fixture carrying both as bait, with death saves
ticked, checked against SCHEMAS[4]. The repository's real-registry test and
the codec test now pin the chain through v5.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `PactSlotsBO`

**Files:**
- Modify: `src/business/counters.ts`, `src/business/types.ts`, `src/business/errors.ts`, `src/business/index.ts`
- Test: `src/business/counters.test.ts`, `src/business/characterSheet.roundTrip.test.ts`

**Interfaces:**
- Consumes: `CharacterDocument['counters']['pactSlots']` (Task 2).
- Produces: `class PactSlotsBO extends SpellSlotBO` with `get level(): number`, `setLevel(value: number): void`, and inherited `current`, `setCurrent(value)`, `total`, `setTotal(value)`; `CountersBO.pactSlots: PactSlotsBO` (getter); `RuleCode` member `'INVALID_SLOT_LEVEL'`; `PactSlotsBO` exported from `src/business/index.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `src/business/counters.test.ts`:

```ts
describe('pact slots', () => {
  it('start with none, at level 1', () => {
    const pact = sheetFor().counters.pactSlots;
    expect([pact.level, pact.current, pact.total]).toEqual([1, 0, 0]);
  });

  it('write their level, remaining and total to the saved document', () => {
    const sheet = sheetFor();
    const pact = sheet.counters.pactSlots;
    pact.setLevel(3);
    pact.setTotal(2);
    pact.setCurrent(1);
    expect(sheet.toDocument().counters.pactSlots).toEqual({ level: 3, current: 1, total: 2 });
  });

  // SpellSlotBO keeps the level it was constructed with, because an ordinary level is its key.
  // A pact level changes, so a held object must read it from the document every time.
  it('read the level from the document, not from when they were handed out', () => {
    const sheet = sheetFor();
    const held = sheet.counters.pactSlots;
    sheet.counters.pactSlots.setLevel(5);
    expect(held.level).toBe(5);
  });

  it('leave the ordinary slots alone', () => {
    const sheet = sheetFor();
    sheet.counters.pactSlots.setTotal(2);
    expect(Object.values(sheet.toDocument().counters.spellSlots)).toEqual(
      Array.from({ length: 9 }, () => ({ current: 0, total: 0 })),
    );
  });

  it('accept every level from 1 to 9', () => {
    const pact = sheetFor().counters.pactSlots;
    for (const level of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      pact.setLevel(level);
      expect(pact.level).toBe(level);
    }
  });

  it.each([0, 10, 2.5, -1, Number.NaN])('reject level %j as INVALID_SLOT_LEVEL', (value) => {
    expect(() => sheetFor().counters.pactSlots.setLevel(value)).toThrow(
      expect.objectContaining({ code: 'INVALID_SLOT_LEVEL' }) as Error,
    );
  });

  it('guard remaining and total as any slot does', () => {
    const pact = sheetFor().counters.pactSlots;
    expect(() => pact.setCurrent(-1)).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
    expect(() => pact.setTotal(1.5)).toThrow(
      expect.objectContaining({ code: 'NOT_AN_INTEGER' }) as Error,
    );
  });

  it('leave remaining alone when the total changes', () => {
    const pact = sheetFor().counters.pactSlots;
    pact.setTotal(2);
    expect(pact.current).toBe(0);
  });
});
```

In `src/business/characterSheet.roundTrip.test.ts`, in `fill()`, after `sheet.counters.spellSlots[0]?.setTotal(4);`:

```ts
  // Level 9, the top of its range, so the two layers' limits are shown to agree at the boundary.
  sheet.counters.pactSlots.setLevel(9);
  sheet.counters.pactSlots.setTotal(2);
  sheet.counters.pactSlots.setCurrent(1);
```

Run: `npx vitest run src/business/counters.test.ts src/business/characterSheet.roundTrip.test.ts`
Expected: FAIL — `pactSlots` is undefined on `CountersBO`.

- [ ] **Step 2: Implement**

`src/business/types.ts`, after `SpellSlotData`:

```ts
export type PactSlotsData = CountersData['pactSlots'];
```

`src/business/errors.ts`: add `| 'INVALID_SLOT_LEVEL'` to `RuleCode`, right after `| 'INVALID_DIE_SIZE'`.

`src/business/counters.ts`: import `RuleViolation` from `'./errors.js'` and `PactSlotsData` from `'./types.js'`. After `SpellSlotBO`, add:

```ts
/**
 * A pact slot's level: a whole number from 1 to 9, the levels `spellSlots` has. One code for every
 * way it goes wrong, as `INVALID_DIE_SIZE` is: `BELOW_ONE` would be false of 10, and
 * `NOT_AN_INTEGER` false of 0. Duplicated from the schema, like `SPELL_SLOT_LEVELS` above.
 */
function slotLevel(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 9) {
    throw new RuleViolation(
      'INVALID_SLOT_LEVEL',
      `a slot level must be a whole number from 1 to 9, got ${value}`,
    );
  }
  return value;
}

/**
 * A warlock's Pact Magic: a spell slot whose level is stored and chosen by the player, not fixed
 * by its key. Only where `level` comes from differs from `SpellSlotBO`; `current` and `total`, and
 * their guards, are inherited. The level is read from the document on every access: the one
 * `SpellSlotBO` keeps from construction would go stale after `setLevel`.
 */
export class PactSlotsBO extends SpellSlotBO {
  readonly #node: PactSlotsData;

  constructor(node: PactSlotsData) {
    super(node, node.level);
    this.#node = node;
  }

  override get level(): number {
    return this.#node.level;
  }

  setLevel(value: number): void {
    this.#node.level = slotLevel(value);
  }
}
```

and in `CountersBO`, after the `spellSlots` getter:

```ts
  get pactSlots(): PactSlotsBO {
    return new PactSlotsBO(this.#node.pactSlots);
  }
```

Update `CountersBO`'s doc comment to: `The categorized shape plus the nine fixed spell slots and the pact slots, which sit alongside the categories in the stored document rather than inside them.`

`src/business/index.ts`: `export { CountersBO, CounterBO, PactSlotsBO, SpellSlotBO } from './counters.js';`

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/business`
Expected: PASS, including the round trip (`CURRENT_SCHEMA` accepts level 9) and the walk that asserts no property exposes the document.

- [ ] **Step 4: Prove they bite**

- Delete the `override get level()`: only "read the level from the document…" fails.
- Change `value > 9` to `value > 10`: only the `10` case fails.
- Write `setLevel` unguarded (`this.#node.level = value`): only the five `reject level` cases fail.
Restore each.

- [ ] **Step 5: Full checks and commit**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`

```bash
git add src/business/counters.ts src/business/types.ts src/business/errors.ts src/business/index.ts \
  src/business/counters.test.ts src/business/characterSheet.roundTrip.test.ts
git commit -m "feat(business): pact slots on counters

PactSlotsBO extends SpellSlotBO: it reads its level from the document and
adds setLevel, and inherits current, total and their guards. A level that
is not a whole number from 1 to 9 is INVALID_SLOT_LEVEL. CountersBO gains
the pactSlots getter beside spellSlots. No clear method: nothing would
call it.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: View, actions and the hub summary

**Files:**
- Modify: `src/ui/types.ts`, `src/ui/bind.ts`, `src/ui/fixtures.ts`, `src/ui/screens/hubSummary.ts`, `src/ui/screens/Counters.stories.tsx`
- Test: `src/ui/bind.test.tsx`, `src/ui/screens/hubSummary.test.ts`

**Interfaces:**
- Consumes: `CountersBO.pactSlots: PactSlotsBO` (Task 3).
- Produces: `CountersView.pactSlots: SpellSlotView`; `CountersActions.setPactSlotLevel(level: number): void`, `setPactSlotCurrent(value: number): void`, `setPactSlotTotal(value: number): void`; `noCountersActions` with those three no-ops; `counters` fixture with `pactSlots: { level: 1, current: 0, total: 0 }`.

- [ ] **Step 1: Types and fixtures (so the tests can compile)**

`src/ui/types.ts`:

```ts
export interface CountersView extends CategorizedView<CounterView> {
  spellSlots: SpellSlotView[];
  /** A warlock's Pact Magic: one entry whose level the player chose. `total: 0` is none. */
  pactSlots: SpellSlotView;
}
```

and in `CountersActions`, after `setSpellSlotTotal`:

```ts
  setPactSlotLevel(level: number): void;
  setPactSlotCurrent(value: number): void;
  setPactSlotTotal(value: number): void;
```

`src/ui/fixtures.ts`: in `counters`, after the `spellSlots` array, add `pactSlots: { level: 1, current: 0, total: 0 },` (Sable is no warlock); in `noCountersActions`, after `setSpellSlotTotal`, add `setPactSlotLevel: () => {},`, `setPactSlotCurrent: () => {},`, `setPactSlotTotal: () => {},`; in `sableJson` (the raw-JSON story's text, deliberately partial), `schemaVersion: 4` → `schemaVersion: 5`.

`src/ui/screens/Counters.stories.tsx`: the `Empty` story's `data` gains `pactSlots: { level: 1, current: 0, total: 0 },` (its own stories are added in Task 5).

`src/ui/screens/hubSummary.test.ts`: the `empty` fixture's `counters` gains `pactSlots: { level: 1, current: 0, total: 0 },`, and the `counters` object in "shows the spell slots in use, then the other counters" gains `pactSlots: { level: 3, current: 0, total: 0 },` (level 3, so a summary that ignored `total` would print `Pact 3rd 0/0` and fail).

- [ ] **Step 2: Write the failing tests**

`src/ui/screens/hubSummary.test.ts`, after "shows the spell slots in use, then the other counters":

```ts
  it('puts pact slots first, then the ordinary levels', () => {
    const counters = {
      categories: [],
      uncategorized: [counter, counter],
      spellSlots: [
        { level: 1, current: 4, total: 4 },
        { level: 2, current: 1, total: 2 },
        { level: 3, current: 0, total: 0 },
      ],
      pactSlots: { level: 3, current: 1, total: 2 },
    };
    expect(summariseSections({ ...empty, counters }).counters).toBe(
      'Pact 3rd 1/2 · 1st 4/4 · 2nd 1/2 · 2 more',
    );
  });

  it('shows a warlock with nothing else as pact slots alone', () => {
    const counters = { ...empty.counters, pactSlots: { level: 5, current: 0, total: 3 } };
    expect(summariseSections({ ...empty, counters }).counters).toBe('Pact 5th 0/3');
  });
```

`src/ui/bind.test.tsx`:
- in the sheet-building setup that calls `sheet.counters.spellSlots[1]?.setCurrent(1);` (around line 68), add after it:

```ts
    sheet.counters.pactSlots.setLevel(3);
    sheet.counters.pactSlots.setTotal(2);
    sheet.counters.pactSlots.setCurrent(1);
```

- after `expect(data.counters.spellSlots[1]).toEqual({ level: 2, current: 1, total: 2 });` add:

```ts
    expect(data.counters.pactSlots).toEqual({ level: 3, current: 1, total: 2 });
```

- in the actions test, after `actions.counters.setSpellSlotCurrent(2, 1);` add:

```ts
    actions.counters.setPactSlotLevel(4);
    actions.counters.setPactSlotTotal(2);
    actions.counters.setPactSlotCurrent(1);
```

- after `expect(doc.counters.spellSlots['2']).toEqual({ current: 1, total: 2 });` add:

```ts
    expect(doc.counters.pactSlots).toEqual({ level: 4, current: 1, total: 2 });
```

Run: `npx vitest run src/ui/bind.test.tsx src/ui/screens/hubSummary.test.ts`
Expected: FAIL — `data.counters.pactSlots` undefined, `actions.counters.setPactSlotLevel` not a function, summary lacks `Pact`.

- [ ] **Step 3: Implement**

`src/ui/bind.ts`, `countersView`, after the `spellSlots` mapping:

```ts
    pactSlots: {
      level: sheet.counters.pactSlots.level,
      current: sheet.counters.pactSlots.current,
      total: sheet.counters.pactSlots.total,
    },
```

`countersActions`, after `setSpellSlotTotal`:

```ts
    setPactSlotLevel: (level) => bo.pactSlots.setLevel(level),
    setPactSlotCurrent: (value) => bo.pactSlots.setCurrent(value),
    setPactSlotTotal: (value) => bo.pactSlots.setTotal(value),
```

`src/ui/screens/hubSummary.ts`, replace the `slots` constant:

```ts
  const { pactSlots: pact } = counters;
  const slots = [
    ...(pact.total > 0
      ? [`Pact ${pact.level}${ordinalSuffix(pact.level)} ${pact.current}/${pact.total}`]
      : []),
    ...counters.spellSlots
      .filter((slot) => slot.total > 0)
      .map((slot) => `${slot.level}${ordinalSuffix(slot.level)} ${slot.current}/${slot.total}`),
  ];
```

- [ ] **Step 4: Run, prove they bite, commit**

Run: `npx vitest run src/ui/bind.test.tsx src/ui/screens/hubSummary.test.ts` → PASS.
Bite: drop the `pact.total > 0` check → only "shows the spell slots in use…" fails (it would read `Pact 3rd 0/0 · …`); swap the two spreads → only "puts pact slots first" fails. Restore.

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`

```bash
git add src/ui/types.ts src/ui/bind.ts src/ui/fixtures.ts src/ui/screens/hubSummary.ts \
  src/ui/screens/Counters.stories.tsx src/ui/bind.test.tsx src/ui/screens/hubSummary.test.ts
git commit -m "feat(ui): bind pact slots and put them first in the hub summary

CountersView gains pactSlots, the same { level, current, total } shape as
an ordinary level, and CountersActions gains setPactSlotLevel, Current and
Total. The hub's Counters line leads with \"Pact 3rd 1/2\" when there are
any pact slots.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The Counters screen — pact row, no-slots button, two-switch dialog

**Files:**
- Modify: `src/ui/screens/Counters.tsx`, `src/ui/screens/Counters.stories.tsx`
- Create: `src/ui/screens/Counters.test.tsx`
- Maybe modify: `src/ui/styles.css` (only if Task 6's visual check needs it)

**Interfaces:**
- Consumes: `CountersView.pactSlots`, the three pact actions, `noCountersActions`, `counters` fixture (Task 4); existing `CheckRow` (`src/ui/components/CheckRow.tsx`: `{ label, checked, onChange(checked: boolean) }`), `NumberField`, `ResponsiveDialog`, `ordinalSuffix`.
- Produces: the finished screen.

- [ ] **Step 1: Write the failing tests**

Create `src/ui/screens/Counters.test.tsx`:

```tsx
// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { stubDialogElement } from '../../test/stubDialog.js';
import { counters, noCountersActions } from '../fixtures.js';
import type { CountersActions, CountersView } from '../types.js';
import { Counters } from './Counters.js';

beforeAll(stubDialogElement);
beforeEach(() => localStorage.clear());

/** Every action a spy, so a test can assert exactly what the screen asked for. */
const spyActions = () =>
  Object.fromEntries(
    Object.keys(noCountersActions).map((key) => [key, vi.fn(() => null)]),
  ) as unknown as { [K in keyof CountersActions]: ReturnType<typeof vi.fn> } & CountersActions;

const NO_SLOTS = counters.spellSlots.map((slot) => ({ ...slot, current: 0, total: 0 }));
const NO_PACT = { level: 1, current: 0, total: 0 };
const PACT = { level: 3, current: 1, total: 2 };

/** `counters` has 1st 4/4 and 2nd 1/2 and no pact slots; each test overrides what it needs. */
const renderWith = (data: Partial<CountersView>, actions: CountersActions = noCountersActions) =>
  render(
    <Counters
      characterId="c"
      data={{ ...counters, ...data }}
      actions={actions}
      onClose={() => {}}
    />,
  );

const remaining = () =>
  screen
    .queryAllByRole('textbox', { name: /slots remaining$/ })
    .map((input) => input.getAttribute('aria-label'));

const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

describe('Spell slots on Counters', () => {
  it('shows only a button when there are no slots of either kind', () => {
    renderWith({ spellSlots: NO_SLOTS, pactSlots: NO_PACT });
    expect(screen.getByRole('button', { name: 'Set spell slots' })).toBeTruthy();
    expect(screen.queryByText('Spell Slots')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByText(/No spell slots yet/)).toBeNull();
    expect(remaining()).toEqual([]);
  });

  it('lists the pact row first, then the ordinary levels in use', () => {
    renderWith({ pactSlots: PACT });
    expect(remaining()).toEqual([
      'Pact slots remaining',
      'Level 1 slots remaining',
      'Level 2 slots remaining',
    ]);
    expect(screen.getByText('Pact 3rd')).toBeTruthy();
    expect(screen.getByText('Spell Slots')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set spell slots' })).toBeNull();
  });

  it("shows a warlock's pact row alone", () => {
    renderWith({ spellSlots: NO_SLOTS, pactSlots: PACT });
    expect(remaining()).toEqual(['Pact slots remaining']);
  });

  it('ticks a pact slot off through its own action', () => {
    const actions = spyActions();
    renderWith({ pactSlots: PACT }, actions);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Pact slots remaining' }));
    expect(actions.setPactSlotCurrent).toHaveBeenCalledWith(0);
    expect(actions.setSpellSlotCurrent).not.toHaveBeenCalled();
  });
});

describe('The spell slots dialog', () => {
  it('opens each switch on when its kind has slots', () => {
    renderWith({ spellSlots: NO_SLOTS, pactSlots: PACT });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(checkbox('Pact magic').checked).toBe(true);
    expect(checkbox('Spell slots').checked).toBe(false);
    expect((screen.getByRole('combobox', { name: 'Level' }) as HTMLSelectElement).value).toBe('3');
    expect(screen.getByRole('textbox', { name: 'Pact slot total' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Level 1 slot total' })).toBeNull();
  });

  // A switch is never stored: one turned on and left at 0 is off again next time, because there
  // is nothing to say it was on.
  it('opens both switches off for a character with no slots', () => {
    renderWith({ spellSlots: NO_SLOTS, pactSlots: NO_PACT });
    fireEvent.click(screen.getByRole('button', { name: 'Set spell slots' }));

    expect(checkbox('Pact magic').checked).toBe(false);
    expect(checkbox('Spell slots').checked).toBe(false);
    expect(screen.queryByRole('combobox', { name: 'Level' })).toBeNull();
  });

  it('switching a kind on only shows its fields', () => {
    const actions = spyActions();
    renderWith({ spellSlots: NO_SLOTS, pactSlots: NO_PACT }, actions);
    fireEvent.click(screen.getByRole('button', { name: 'Set spell slots' }));
    fireEvent.click(checkbox('Pact magic'));
    fireEvent.click(checkbox('Spell slots'));

    expect(screen.getByRole('textbox', { name: 'Pact slot total' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Level 9 slot total' })).toBeTruthy();
    expect(screen.getByText('Set slots per level. 0 hides the level.')).toBeTruthy();
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });

  it('sets the pact level and the number of pact slots', () => {
    const actions = spyActions();
    renderWith({ pactSlots: PACT }, actions);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const level = screen.getByRole('combobox', { name: 'Level' }) as HTMLSelectElement;
    expect(Array.from(level.options).map((option) => option.textContent)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '5th',
      '6th',
      '7th',
      '8th',
      '9th',
    ]);
    fireEvent.change(level, { target: { value: '5' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Pact slot total' }), {
      target: { value: '3' },
    });

    expect(actions.setPactSlotLevel).toHaveBeenCalledWith(5);
    expect(actions.setPactSlotTotal).toHaveBeenCalledWith(3);
  });

  it('switching pact magic off zeroes its slots and leaves its level', () => {
    const actions = spyActions();
    renderWith({ pactSlots: PACT }, actions);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(checkbox('Pact magic'));

    expect(actions.setPactSlotTotal).toHaveBeenCalledWith(0);
    expect(actions.setPactSlotCurrent).toHaveBeenCalledWith(0);
    expect(actions.setPactSlotLevel).not.toHaveBeenCalled();
    expect(actions.setSpellSlotTotal).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox', { name: 'Level' })).toBeNull();
  });

  it('switching spell slots off zeroes all nine levels and nothing else', () => {
    const actions = spyActions();
    renderWith({ pactSlots: PACT }, actions);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(checkbox('Spell slots'));

    const allNine = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => [level, 0]);
    expect(actions.setSpellSlotTotal.mock.calls).toEqual(allNine);
    expect(actions.setSpellSlotCurrent.mock.calls).toEqual(allNine);
    expect(actions.setPactSlotTotal).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Level 1 slot total' })).toBeNull();
  });
});
```

Run: `npx vitest run src/ui/screens/Counters.test.tsx`
Expected: FAIL — no `Set spell slots` button, no pact row, no switches.

- [ ] **Step 2: Implement the screen**

In `src/ui/screens/Counters.tsx`:

Add `import { CheckRow } from '../components/CheckRow.js';` and widen the type import to `import type { CategoryView, CountersActions, CountersView, CounterView, SpellSlotView } from '../types.js';`.

Three replacements inside `Counters`; the `renderRow` body and the `new`/`edit` dialogs stay exactly as they are.

(a) Replace

```tsx
  // A level with no slots at all is hidden rather than shown as 0/0 — a wizard has three rows,
  // not nine. "Set totals" is how it comes back, which is why that button is always present.
  const visibleSlots = data.spellSlots.filter((slot) => slot.total > 0);
```

with

```tsx
  // A level with no slots at all is hidden rather than shown as 0/0 — a wizard has three rows,
  // not nine — and so is the pact row, for everyone but a warlock. With no slots of either kind
  // there is no table at all, only the button that sets some up.
  const pact = data.pactSlots;
  const visibleSlots = data.spellSlots.filter((slot) => slot.total > 0);
  const hasSlots = pact.total > 0 || visibleSlots.length > 0;
  const openSlots = () => setDialog({ kind: 'slots' });
```

(b) Replace the `CategorizedSection`'s children — the `<div className="sechead-row">` holding "Spell Slots" / "Set totals" and the `<div className="slotblock">` after it — with

```tsx
        {hasSlots ? (
          <>
            <div className="sechead-row">
              <span className="sechead static">Spell Slots</span>
              <button type="button" className="txtbtn" onClick={openSlots}>
                Edit
              </button>
            </div>
            <div className="slotblock">
              {pact.total > 0 && (
                <SlotRow
                  name={`Pact ${pact.level}${ordinalSuffix(pact.level)}`}
                  label="Pact slots remaining"
                  slot={pact}
                  onChange={actions.setPactSlotCurrent}
                />
              )}
              {visibleSlots.map((slot) => (
                <SlotRow
                  key={slot.level}
                  name={`${slot.level}${ordinalSuffix(slot.level)}`}
                  label={`Level ${slot.level} slots remaining`}
                  slot={slot}
                  onChange={(value) => actions.setSpellSlotCurrent(slot.level, value)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="sechead-row">
            <button type="button" className="txtbtn" onClick={openSlots}>
              Set spell slots
            </button>
          </div>
        )}
```

(c) Replace the whole `{dialog?.kind === 'slots' && ( <ResponsiveDialog title="Spell slot totals" …> … </ResponsiveDialog> )}` block with

```tsx
      {dialog?.kind === 'slots' && (
        <SpellSlotsDialog data={data} actions={actions} onClose={close} />
      )}
```

Add these two components below `Counters`, before `NewCounterDialog`:

```tsx
function SlotRow({
  name,
  label,
  slot,
  onChange,
}: {
  name: string;
  label: string;
  slot: SpellSlotView;
  onChange(value: number): void;
}) {
  return (
    <div className="slotrow">
      <span className="slotlvl">{name}</span>
      <span className="valcluster">
        <NumberField
          label={label}
          className="curinp"
          value={slot.current}
          onChange={onChange}
          stepper
        />
        <span className="maxlbl">/ {slot.total}</span>
      </span>
    </div>
  );
}

/**
 * Both kinds of slot, each behind a switch. A switch is this dialog's state and never stored: it
 * opens on when its kind has a slot, and switching it off sets that kind's slots to 0, so what it
 * says always matches what the sheet shows once the dialog closes. The pact level is left as it
 * was: at 0 slots it means nothing, and it pre-fills the next time the switch goes on.
 */
function SpellSlotsDialog({
  data,
  actions,
  onClose,
}: {
  data: CountersView;
  actions: CountersActions;
  onClose(): void;
}) {
  const [pactOn, setPactOn] = useState(data.pactSlots.total > 0);
  const [slotsOn, setSlotsOn] = useState(data.spellSlots.some((slot) => slot.total > 0));

  const switchPact = (on: boolean) => {
    setPactOn(on);
    if (on) return;
    actions.setPactSlotTotal(0);
    actions.setPactSlotCurrent(0);
  };
  const switchSlots = (on: boolean) => {
    setSlotsOn(on);
    if (on) return;
    for (const slot of data.spellSlots) {
      actions.setSpellSlotTotal(slot.level, 0);
      actions.setSpellSlotCurrent(slot.level, 0);
    }
  };

  return (
    <ResponsiveDialog title="Spell slots" open onClose={onClose}>
      <CheckRow label="Pact magic" checked={pactOn} onChange={switchPact} />
      {pactOn && (
        <div>
          <div className="setup-row">
            <label className="lv" htmlFor="pact-level">
              Level
            </label>
            <select
              id="pact-level"
              className="inp"
              value={data.pactSlots.level}
              onChange={(event) => actions.setPactSlotLevel(Number(event.target.value))}
            >
              {data.spellSlots.map(({ level }) => (
                <option key={level} value={level}>
                  {level}
                  {ordinalSuffix(level)}
                </option>
              ))}
            </select>
          </div>
          <div className="setup-row">
            <span className="lv">Slots</span>
            <NumberField
              label="Pact slot total"
              className="inp"
              value={data.pactSlots.total}
              onChange={actions.setPactSlotTotal}
            />
          </div>
        </div>
      )}
      <CheckRow label="Spell slots" checked={slotsOn} onChange={switchSlots} />
      {slotsOn && (
        <div>
          <div className="hint">Set slots per level. 0 hides the level.</div>
          {data.spellSlots.map((slot) => (
            <div className="setup-row" key={slot.level}>
              <span className="lv">
                {slot.level}
                {ordinalSuffix(slot.level)} level
              </span>
              <NumberField
                label={`Level ${slot.level} slot total`}
                className="inp"
                value={slot.total}
                onChange={(value) => actions.setSpellSlotTotal(slot.level, value)}
              />
            </div>
          ))}
        </div>
      )}
    </ResponsiveDialog>
  );
}
```

Note: the level `<option>` text is `{level}{ordinalSuffix(level)}`; React renders it as two text nodes, and `option.textContent` joins them to `3rd`, which is what the test reads.

- [ ] **Step 3: Run the tests**

Run: `npx vitest run src/ui/screens/Counters.test.tsx`
Expected: PASS.

- [ ] **Step 4: Prove they bite**

- Render the pact row after the ordinary rows: only "lists the pact row first…" fails.
- Initialise `pactOn` with `true`: "opens both switches off…" and "switching a kind on only shows its fields" fail.
- Remove `actions.setPactSlotCurrent(0)` from `switchPact`: only "switching pact magic off…" fails.
- Drop the `hasSlots` branch (always render the heading): only "shows only a button…" fails.
Restore each.

- [ ] **Step 5: Stories**

`src/ui/screens/Counters.stories.tsx`: update the `Populated` doc comment to `/** Levels with no slots are hidden rather than shown as 0/0 — “Edit” brings them back. */`, the `Empty` story gets a doc comment `/** No slots of either kind: only the button that sets some up. */`, and add after `Populated`:

```tsx
/** A warlock: pact slots only, so the table is one row. */
export const Warlock: Story = {
  args: {
    data: {
      ...counters,
      spellSlots: counters.spellSlots.map((slot) => ({ ...slot, current: 0, total: 0 })),
      pactSlots: { level: 3, current: 1, total: 2 },
    },
  },
};

/** A warlock multiclassed into a full caster: the pact row first, then the ordinary levels. */
export const Multiclass: Story = {
  args: { data: { ...counters, pactSlots: { level: 3, current: 1, total: 2 } } },
};
```

- [ ] **Step 6: Full checks and commit**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`

```bash
git add src/ui/screens/Counters.tsx src/ui/screens/Counters.test.tsx src/ui/screens/Counters.stories.tsx
git commit -m "feat(ui): pact slots on the Counters screen

The spell slot table leads with a Pact row (\"Pact 3rd\") when there are any
pact slots. With no slots of either kind there is no table, only a \"Set
spell slots\" button; otherwise the heading's button is now \"Edit\".

The dialog has two switches, Pact magic and Spell slots. Each opens on when
its kind has a slot, and switching it off sets that kind's slots to 0, so
the switch never disagrees with the sheet. The pact level stays. The
switches are dialog state, never stored.

Counters had no tests; Counters.test.tsx covers the empty state, row order,
both switches and the pact fields. Stories: Warlock and Multiclass.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Browser check, screenshots, docs

**Files:**
- Modify: `AGENTS.md`, `docs/BACKLOG.md`, `docs/superpowers/specs/2026-10-18-pact-slots-design.md` (status line, plus a "Deviations" section only if the build differs from the spec)
- Maybe modify: `src/ui/styles.css` (only for a layout problem seen here)
- Screenshots go to the session scratchpad, not the repo.

**Interfaces:**
- Consumes: the finished feature (Tasks 1–5).

- [ ] **Step 1: Run the dev server**

Run `npm run dev` in the background and note the URL it prints (normally `http://localhost:5173/`). The dev seed creates Sable, Thorne and Wren when the store is empty; Thorne (a fighter) has no slots.

- [ ] **Step 2: Walk the feature with Playwright MCP, at 360×780, light theme**

1. Open Thorne → Counters. Expect only `Set spell slots`; screenshot `01-no-slots.png`.
2. Press it. Expect both switches off; screenshot `02-dialog-empty.png`.
3. Switch Pact magic on, choose `3rd`, type `2` into Slots. Screenshot `03-dialog-pact.png`. Close.
4. Expect `Spell Slots` + `Edit`, one row `Pact 3rd  0 / 2` (setting a total does not fill `current`). Press `+` twice → `2 / 2`, then `−` once → `1 / 2`. Screenshot `04-warlock.png`.
5. Reload the page, reopen Thorne → Counters: still `Pact 3rd 1 / 2`.
6. Open Sable → Counters → Edit, switch Pact magic on, level `3rd`, slots `2`; close. Expect the pact row above `1st` and `2nd`. Screenshot `05-multiclass.png`. Go back to the hub; the Counters line starts `Pact 3rd 0/2 · 1st 4/4 · 2nd 1/2`. Screenshot `06-hub.png`.
7. Edit again, switch Spell slots off; close. Only the pact row remains. Switch Pact magic off too; close. Only `Set spell slots` remains, and reopening shows both switches off.
8. Import `testAssets/zahir-ibn-talaar-2026-09-24.json` (a v1 export) from the list's menu; open its raw JSON: `counters` ends with `"pactSlots": { "level": 1, "current": 0, "total": 0 }` and `schemaVersion` is 5.

- [ ] **Step 3: Repeat the look at 320px and in dark mode**

At 320×700, light: screenshots of the multiclass table and the dialog with both switches on (`07-320-table.png`, `08-320-dialog.png`). Then switch the theme to Dark from the list's menu, 360px: the same two (`09-dark-table.png`, `10-dark-dialog.png`). Check that `Pact 3rd` does not wrap awkwardly against the stepper, that the level `<select>` shows `9th` without clipping, and that the switches have breathing room above them. If anything needs CSS, change `src/ui/styles.css` only, re-run `npm test`, and re-take the affected screenshots.

- [ ] **Step 4: Docs**

`AGENTS.md`:
- After the "Schema v4: death saving throws" entry, add a "Schema v5: pact slots" entry in the same style: what v5 adds (`counters.pactSlots`, `{ level 1–9, current, total }`, last in counters, total 0 = none), that nothing is computed (no level from warlock levels, no short-rest refill), `PactSlotsBO extends SpellSlotBO` and why (`level` read from the document; `INVALID_SLOT_LEVEL`), `migrateV4ToV5` and `v4DocFor`'s bait, the UI (pact row first, the no-slots button, the two-switch dialog: switches are dialog state, switching off zeroes and keeps the level, the user's choices), and what was verified in Chromium (Step 2–3, with widths and themes).
- "Schema versions are isolated by construction": add "and `v5/` as a copy of `v4/` on 2026-10-18".
- Map: `v4/` becomes `frozen: v3 plus death saves`; add `v5/  current: v4 plus pact slots; blank lives here now`; migration line adds `v4ToV5.ts`; `counters.ts` line becomes `CounterBO / SpellSlotBO / PactSlotsBO, over categorized.ts plus the nine fixed slots and the pact slots`; fixtures line adds `v4DocFor`.
- Update the test count line to what `npm test` prints now.

`docs/BACKLOG.md`, under Done:

```markdown
- **Pact slots.** Shipped on branch `feature/pact-slots` as schema v5: `counters.pactSlots`, one
  entry whose level the player chooses, first in the Counters spell slot table. Design in
  `docs/superpowers/specs/2026-10-18-pact-slots-design.md`.
```

Spec status line: `Status: **built 2026-10-18** on branch \`feature/pact-slots\`, from \`docs/superpowers/plans/2026-10-18-pact-slots.md\`.` If anything was built differently from the spec, add a final "## 8. Deviations" section listing each one and why.

- [ ] **Step 5: Final checks and commit**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check . && npm run build`
Expected: all green.

```bash
git add AGENTS.md docs/BACKLOG.md docs/superpowers/specs/2026-10-18-pact-slots-design.md
# plus src/ui/styles.css if Step 3 changed it
git commit -m "docs: record schema v5 and pact slots

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

Stop the dev server.
