# Attack Rolls and Spellcasting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- A weapon records its attack roll: an ability, an attack bonus and free-text damage.
- The Spell List records a spell attack bonus and a spell save DC per spellcasting ability.
- Every number is entered by the player. Nothing is computed.

**Architecture:**
- **Schema v2**, a copy of v1 with two additions: `equipment.weapons[].attack` and
  `spellList.spellcasting`.
- **Migration 1 → 2** gives every weapon `attack: null` and the spell list `spellcasting: {}`.
- **Business layer:**
  - `WeaponBO` is a new subclass of an `EquipmentItemBO` that becomes generic.
  - `SpellcastingBO` / `SpellcastingEntryBO` are keyed by ability, like `HitDicesBO` / `HitDieBO`.
  - `SpellListBO` becomes a class, the way `CountersBO` is.
- **UI:**
  - A new `AbilityPicker` component.
  - Spellcasting chips above the spell categories.
  - The attack on each weapon row, and in the weapon dialogs.

**Tech Stack:** TypeScript 6, Zod 4.4.3, MobX 7, React 19, Vitest 4, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-26-attack-rolls-design.md`. The UI mockups are in
`docs/superpowers/specs/2026-09-26-attack-rolls-mockups/`. Read the spec, its mockups, `AGENTS.md`
and `src/data/schema/README.md` before starting. Where this plan and the spec disagree, the spec
wins; stop and say so.

## Global Constraints

- **Branch:** `claude/dnd-attack-roll-calculations-omg43t`. Run `npm ci` first.
- **A stash exists**: `stash@{0}`, "wip: attack rolls implementation, paused for spec". It predates
  the spec (it uses `bonus` and has no `damage`). **Do not apply it.** Drop it after Task 3 lands
  (`git stash drop stash@{0}`), once nothing in it is needed for reference.
- **v1 is frozen.** Nothing under `src/data/schema/v1/` changes, tests included. If a v1 test
  fails, the change is in the wrong place.
- **Ability keys** are the full names `strength` … `charisma`. `STR` … `CHA` are UI labels from
  `src/ui/reference.ts`.
- **Field names:**
  - weapon: `attack: { ability, attackBonus, damage } | null`
  - spellcasting: `spellcasting: { [ability]?: { attackBonus, saveDc } }`
- **Limits:**
  - damage: 0–80 characters, no leading or trailing whitespace; the business layer trims on write
  - `attackBonus`: any integer
  - `saveDc`: an integer ≥ 0
- **Rule codes added:** `UNKNOWN_ABILITY`, `DUPLICATE_SPELLCASTING`, `NO_ATTACK`. None of them
  goes in `bind.ts`'s `PRESENTABLE`.
- **Layer rules are lint-enforced:**
  - `ui → business → data → shared`, never upward.
  - Nothing outside `src/data/schema/` imports `schema/v*/`, tests included.
- **Before every commit** run `npm test`, `npm run typecheck` and `npm run lint`, and
  `npx prettier --check .` must be clean.
- **Every new test must be proven to bite.** Break the thing it guards, watch that test (and only
  that test) fail, then restore it. Report what you broke in the task summary.
- **Verify APIs against the installed versions**, not memory. `z.partialRecord` was checked
  against zod 4.4.3: it rejects a non-enum key and accepts `{}`.
- **Commits:**
  - Conventional Commit prefixes.
  - Stage explicit paths, never `git add -A`.
  - Every message ends with the session's attribution lines:

    ```
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01JvShsied2ecEuaHZFP5kzT
    ```

## Review Focus

These are the inputs most likely to hurt a player that no happy-path example exercises. Each has a
test in the task named.

1. **A real v1 character whose weapon descriptions say "Damage: 1d8 Slashing".** It must migrate
   to `attack: null`, never to a parsed guess. Test: Task 2 (Zahir file).
2. **Typing `1d8+3 piercing` into the damage field.** The space must survive: damage saves on
   blur, never per keystroke. Test: Task 5.
3. **Changing a weapon's ability from STR to DEX after typing the bonus.** The bonus and damage
   must be kept. Test: Task 3.
4. **Adding spellcasting for an ability that already has an entry.** The UI never offers it, and
   the business layer throws `DUPLICATE_SPELLCASTING` loudly if something does. Tests: Task 4 and
   Task 6.
5. **An `EquipmentItemBO` for an item in Other Equipment.** It must never grow an `attack` key: the
   v2 schema rejects one there. Tests: Task 1 (schema) and Task 3 (round trip).

---

### Task 1: Schema v2

**Files:**
- Create: `src/data/schema/v2/` as a literal copy of `src/data/schema/v1/` (all seven files,
  tests included)
- Modify, inside `v2/` only: `primitives.ts`, `document.ts`, `blank.ts`, `index.ts`, and the three
  test files

**Interfaces:**
- Produces:
  - `characterDocumentV2Schema`, `type CharacterDocumentV2`
  - `createCharacter`, which now returns `schemaVersion: 2`
- Nothing outside `v2/` changes in this task. `schema/index.ts` still points at v1 until Task 2.

- [ ] **Step 1: Copy and rename**

```bash
cp -r src/data/schema/v1 src/data/schema/v2
cd src/data/schema/v2
sed -i 's/characterDocumentV1Schema/characterDocumentV2Schema/g; s/CharacterDocumentV1/CharacterDocumentV2/g' *.ts
```

Replace each file's four-line (source) or three-line (test) header with the v2 wording:

```ts
// Schema v2, frozen from its first release: this file defines what a v2 character document is
// allowed to be, and that meaning must not change under already-stored documents. A rule change
// here is a new schema version, not an edit — see ../README.md#when-the-freeze-begins for what
// "frozen" means and when it starts applying.
```

```ts
// Schema v2, frozen from its first release: these tests lock in what a v2 character document is
// allowed to be. Editing an assertion here to let new code pass is editing v2's meaning — see
// ../README.md#when-the-freeze-begins for what "frozen" means and when it starts applying.
```

Run `npx vitest run src/data/schema/v2`. It must pass unchanged, still validating v1 shapes under
v2 names. That proves the copy is faithful before anything diverges.

- [ ] **Step 2: Write the failing tests**

`v2/primitives.test.ts`, a new `describe`:

```ts
describe('damageText', () => {
  it('accepts an empty string: no damage entered yet', () => {
    expect(damageText.safeParse('').success).toBe(true);
  });
  it('accepts dice and a type, with inner spaces', () => {
    expect(damageText.safeParse('1d8+3 piercing').success).toBe(true);
  });
  it.each([' 1d8', '1d8 ', '\t1d8'])('rejects padding %j rather than trimming it', (value) => {
    expect(damageText.safeParse(value).success).toBe(false);
  });
  it('accepts 80 characters and rejects 81', () => {
    expect(damageText.safeParse('x'.repeat(80)).success).toBe(true);
    expect(damageText.safeParse('x'.repeat(81)).success).toBe(false);
  });
});
```

`v2/document.test.ts`:
- **In `validDocument()`:**
  - set `schemaVersion: 2 as const`
  - give the Rapier `attack: { ability: 'dexterity' as const, attackBonus: 7, damage: '1d8+4 piercing' }`
  - add a second weapon: id `55555555-5555-4555-8555-555555555555`, name `Improvised club`,
    `attack: null`
  - add `spellcasting: { intelligence: { attackBonus: 7, saveDc: 15 }, wisdom: { attackBonus: -1, saveDc: 9 } }`
    to `spellList`
- **Retarget** "requires schemaVersion to be exactly 1" to exactly 2; the rejected value becomes 1.
- **New `it`s**, each asserting `characterDocumentV2Schema.safeParse(doc).success`:
  - weapon without an `attack` key → false
  - each of the six `ABILITY_KEYS` as `attack.ability` → true
  - each of `'STR'`, `'luck'`, `''`, `null` as `attack.ability` → false
  - `attackBonus: -2` → true
  - `attackBonus: 1.5` → false
  - `attack: { attackBonus: 5, damage: '' }`, with no ability → false
  - `damage: ' 1d8'` → false
  - `damage: 'x'.repeat(81)` → false
  - `attack: null` on an `equipment.other` item → false
  - `spellcasting: {}` → true
  - `spellcasting` key deleted → false
  - `spellcasting.luck = { attackBonus: 1, saveDc: 9 }` → false
  - `spellcasting.wisdom.saveDc = -1` → false
  - `spellcasting.wisdom.attackBonus = -3` → true
- **Unknown-key table:**
  - rename the row "an equipment item" to "a weapon"
  - add rows for: `equipment.other[0]`, `equipment.weapons[0].attack`, the `spellcasting` record
    (an extra key holding a valid entry, so only the key is wrong), `spellcasting.intelligence`,
    and the `spellList` object itself

`v2/blank.test.ts`:
- the schema test now says "v2"
- `schemaVersion` must be `2`
- `doc.spellList.spellcasting` must equal `{}`
- the pushed weapon in the independence table gains `attack: null`
- a new independence row for `spellList.spellcasting`, which sets `.intelligence` on the first
  document and reads `{}` on the second

- [ ] **Step 3: Run the tests to watch them fail**

Run: `npx vitest run src/data/schema/v2`. Expect failures on every new case, and on the
`schemaVersion` case.

- [ ] **Step 4: Implement**

`v2/primitives.ts`:
- Change `signedInt`'s doc comment to
  `/** The three modifiers (spec §3.3), plus v2's weapon and spell attack bonuses. */`.
- Change "like every object schema in v1" to "in v2".
- Add:

```ts
/**
 * v2. A weapon's damage as the player writes it: "1d8+3 piercing". May be empty — no damage
 * entered yet — which is why it is not a `shortName`. Padding is rejected rather than trimmed, for
 * the same reason as a name's; the business layer trims on write.
 */
export const damageText = z.string().max(MAX_SHORT_NAME).refine(isTrimmed, NOT_TRIMMED);
```

`v2/document.ts`: import `damageText`, then add after `equipmentItem`:

```ts
/** Built from the same tuple as the abilities map, so the two can never name different sets. */
const abilityKey = z.enum(ABILITY_KEYS);

/**
 * v2. The player's attack roll for one weapon: the ability they roll with, the bonus, the damage.
 * One object because nothing in it exists without the ability — clearing the ability clears the
 * attack. `null` is "no attack roll entered", which every weapon migrated from v1 carries.
 */
const weaponAttack = z
  .object({ ability: abilityKey, attackBonus: signedInt, damage: damageText })
  .strict();

const weaponItem = equipmentItem.extend({ attack: weaponAttack.nullable() }).strict();
```

After `countersItem`:

```ts
/**
 * v2. One entry per spellcasting ability, keyed by it: the key is the identity, like a hit die's
 * size, so there is no id and a second Intelligence entry cannot be represented. Both numbers are
 * entered by the player; the DC is not worked out from the attack bonus or anything else.
 */
const spellcastingEntry = z.object({ attackBonus: signedInt, saveDc: nonNegativeInt }).strict();
```

In `documentShape`:
- `schemaVersion: z.literal(2)`
- `weapons: z.array(weaponItem)`, with `other` unchanged
- the spell list becomes:

```ts
  spellList: categorized(spellListItem)
    .extend({ spellcasting: z.partialRecord(abilityKey, spellcastingEntry) })
    .strict(),
```

`v2/blank.ts`:
- `schemaVersion: 2`
- `spellList: { ...emptyCategorized(), spellcasting: {} }`

- [ ] **Step 5: Run the tests and prove they bite**

Run `npx vitest run src/data/schema/v2`, which must pass, and `npx vitest run src/data/schema/v1`,
which must be unchanged and pass. Then break each of these, one at a time, and watch only its
test fail:
- drop `.strict()` from `weaponAttack`
- replace `z.partialRecord(abilityKey, …)` with `z.record(z.string(), …)`
- change `weaponItem` to `equipmentItem` in `weapons`
- remove the `.refine` from `damageText`

- [ ] **Step 6: Commit**

```bash
git add src/data/schema/v2
git commit -m "feat(schema): add v2 with weapon attacks and spellcasting"
```

---

### Task 2: Migration 1 → 2, and making v2 current

**Files:**
- Create: `src/data/migration/v1ToV2.ts`, `src/data/migration/v1ToV2.test.ts`,
  `src/test/fixtures.test.ts`
- Modify:
  - `src/data/migration/migrations.ts`, `src/data/schema/index.ts`, `src/data/schema/README.md`
    (step 4)
  - `src/test/fixtures.ts`
  - `src/data/repository/indexedDbRepository.test.ts`, `src/data/remote/codec.test.ts`
  - `src/business/types.ts` and `src/business/equipment.ts`, only what typecheck forces
  - `src/ui/fixtures.ts` (`sableJson`'s `schemaVersion: 2`)

**Interfaces:**
- Produces:
  - `migrateV1ToV2: Migration`
  - `MIGRATIONS` holding `1 → migrateV1ToV2`
  - `CURRENT = 2`
  - `SCHEMAS = { 1, 2 }`
  - `CharacterDocument = CharacterDocumentV2`
  - `v1DocFor(id, name)`, test-only
- Consumers: every caller of `parseCharacter`, unchanged.

- [ ] **Step 1: Add the v1 fixture, and a test that it really is v1**

`src/test/fixtures.ts` gains `V1_WEAPON_ID = '66666666-6666-4666-8666-666666666666'`,
`V1_OTHER_ID = '77777777-7777-4777-8777-777777777777'` and:

```ts
/**
 * A complete v1 document, written out by hand. `createCharacter` makes the current version, and
 * nothing outside `schema/` may import `v1/`, so a test that needs an older document spells it.
 * `fixtures.test.ts` checks it against `SCHEMAS[1]`: a migration test whose input was never valid
 * v1 would pass for the wrong reason. The weapon's description is the kind a player really
 * writes — which the migration must leave alone.
 */
export function v1DocFor(id: string, name: string): Record<string, unknown> {
  const zero = () => ({ current: 0, total: 0 });
  const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'];
  const skills = [
    'acrobatics', 'animalHandling', 'arcana', 'athletics', 'deception', 'history', 'insight',
    'intimidation', 'investigation', 'medicine', 'nature', 'perception', 'performance',
    'persuasion', 'religion', 'sleightOfHand', 'stealth', 'survival',
  ];
  return {
    schemaVersion: 1,
    id,
    name,
    updatedAt: FIXED_NOW.toISOString(),
    classes: [],
    hitPoints: { current: 0, total: 0, temporary: 0 },
    hitDices: {},
    armorClass: 0,
    journalAndNotes: { journal: [], notes: '' },
    inventory: { coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, items: [] },
    featsAndTraits: { categories: [], uncategorized: [] },
    equipment: {
      weapons: [
        { id: V1_WEAPON_ID, name: 'Rapier', description: '+5 to hit, 1d8+3 piercing',
          attuned: false, equipped: true },
      ],
      other: [
        { id: V1_OTHER_ID, name: 'Cloak', description: '', attuned: true, equipped: true },
      ],
    },
    spellList: { categories: [], uncategorized: [] },
    counters: {
      categories: [],
      uncategorized: [],
      spellSlots: Object.fromEntries(['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((l) => [l, zero()])),
    },
    abilitiesAndSkills: {
      proficiencyBonus: 0,
      passivePerception: 0,
      speed: 0,
      abilities: Object.fromEntries(abilities.map((k) => [k,
        { score: 0, modifier: 0, savingThrowModifier: 0, savingThrowProficient: false }])),
      skills: Object.fromEntries(skills.map((k) => [k, { modifier: 0, proficient: false, expertise: false }])),
    },
  };
}
```

(Let Prettier lay it out.) `src/test/fixtures.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SCHEMAS } from '../data/schema/index.js';
import { ID_A, v1DocFor } from './fixtures.js';

describe('v1DocFor', () => {
  it('is a valid v1 document, so a migration test cannot pass on bad input', () => {
    expect(SCHEMAS[1]!.safeParse(v1DocFor(ID_A, 'Sable')).success).toBe(true);
  });
});
```

Run it: it must pass now, before anything else changes. Prove it bites by misspelling one skill key.

- [ ] **Step 2: Write the failing migration tests**

`src/data/migration/v1ToV2.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMAS } from '../schema/index.js';
import { ID_A, V1_OTHER_ID, V1_WEAPON_ID, v1DocFor } from '../../test/fixtures.js';
import { parseCharacter } from './parseCharacter.js';
import { migrateV1ToV2 } from './v1ToV2.js';

const zahir = (
  JSON.parse(
    readFileSync(new URL('../../../testAssets/zahir-ibn-talaar-2026-09-24.json', import.meta.url), 'utf8'),
  ) as { sheet: Record<string, unknown> }
).sheet;

describe('migrateV1ToV2', () => {
  it('adds an empty attack to each weapon and empty spellcasting, and nothing else', () => {
    const v1 = v1DocFor(ID_A, 'Sable');
    const v2 = migrateV1ToV2(v1) as Record<string, any>;

    expect(v2.schemaVersion).toBe(2);
    expect(v2.equipment.weapons).toEqual([
      { id: V1_WEAPON_ID, name: 'Rapier', description: '+5 to hit, 1d8+3 piercing',
        attuned: false, equipped: true, attack: null },
    ]);
    expect(v2.equipment.other).toEqual([
      { id: V1_OTHER_ID, name: 'Cloak', description: '', attuned: true, equipped: true },
    ]);
    expect(v2.spellList).toEqual({ categories: [], uncategorized: [], spellcasting: {} });
    const { schemaVersion: _a, equipment: _b, spellList: _c, ...restV2 } = v2;
    const { schemaVersion: _d, equipment: _e, spellList: _f, ...restV1 } = v1;
    expect(restV2).toEqual(restV1);
  });

  it('produces a valid v2 document', () => {
    expect(SCHEMAS[2]!.safeParse(migrateV1ToV2(v1DocFor(ID_A, 'Sable'))).success).toBe(true);
  });

  it('does not mutate its input', () => {
    const v1 = v1DocFor(ID_A, 'Sable');
    const before = structuredClone(v1);
    migrateV1ToV2(v1);
    expect(v1).toEqual(before);
  });

  it('never reads an attack out of a description: the real Zahir file', () => {
    // Every weapon in this exported character says "Damage: 1dN …" in its description.
    expect(SCHEMAS[1]!.safeParse(zahir).success).toBe(true);
    const v2 = migrateV1ToV2(zahir) as { equipment: { weapons: { attack: unknown }[] } };
    expect(v2.equipment.weapons.length).toBeGreaterThan(0);
    expect(v2.equipment.weapons.every((weapon) => weapon.attack === null)).toBe(true);
    expect(SCHEMAS[2]!.safeParse(v2).success).toBe(true);
  });
});

describe('parseCharacter on a v1 document', () => {
  it('returns the migrated v2 document', () => {
    const result = parseCharacter(v1DocFor(ID_A, 'Sable'));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc).toEqual(migrateV1ToV2(v1DocFor(ID_A, 'Sable')));
  });
});
```

If lint rejects `any` in the test, narrow with a local type instead of disabling the rule.

- [ ] **Step 3: Run the tests to watch them fail**

Run: `npx vitest run src/data/migration/v1ToV2.test.ts`. Expect: the module is not found.

- [ ] **Step 4: Implement the migration and register v2**

`src/data/migration/v1ToV2.ts`:

```ts
import type { Migration } from './migrations.js';

/**
 * Only the parts of a v1 document this step touches, restated structurally: nothing outside
 * `src/data/schema/` may import a version directory, and the walk has already validated the
 * input at v1, so this describes what is known to be there rather than checking it.
 */
interface V1Shape {
  schemaVersion: 1;
  equipment: { weapons: object[]; other: object[] };
  spellList: object;
}

/**
 * v1 → v2 (2026-09-26): weapons gain `attack`, the spell list gains `spellcasting`.
 *
 * Both start empty — `attack: null`, `spellcasting: {}` — because a v1 document said nothing
 * about either, and anything else would be the app inventing a number the player never entered.
 * No description is read: "Damage: 1d8 Slashing" in one is the player's note, and parsing it would
 * be a silent rewrite of their sheet.
 *
 * Frozen once released, like the schema it produces: cloud versions are never rewritten, so a v1
 * backup goes through this function on every restore, forever. Builds new objects rather than
 * editing its input.
 */
export const migrateV1ToV2: Migration = (input) => {
  const doc = input as V1Shape;
  return {
    ...doc,
    schemaVersion: 2,
    equipment: {
      ...doc.equipment,
      weapons: doc.equipment.weapons.map((weapon) => ({ ...weapon, attack: null })),
    },
    spellList: { ...doc.spellList, spellcasting: {} },
  };
};
```

`src/data/migration/migrations.ts`:

```ts
import { migrateV1ToV2 } from './v1ToV2.js';

/** Migrates a document from version N to N+1. Pure; assumes its input already validated at N. */
export type Migration = (doc: unknown) => unknown;

/** Keyed by source version: the entry at N takes a document from N to N+1. */
export const MIGRATIONS = new Map<number, Migration>([[1, migrateV1ToV2]]);
```

`src/data/schema/index.ts`:
- import `characterDocumentV1Schema` from v1, and `characterDocumentV2Schema` and
  `CharacterDocumentV2` from v2
- `CURRENT = 2`
- `SCHEMAS = { 1: characterDocumentV1Schema, 2: characterDocumentV2Schema }`
- `CharacterDocument = CharacterDocumentV2`
- `CURRENT_SCHEMA = characterDocumentV2Schema`
- re-export `createCharacter` from `./v2/index.js`
- reword the trailing comment so it names no single version as current: "each version's
  consumers of its tuples and schema live inside its own directory …"

`src/data/schema/README.md`, "Adding a new version", step 4: say it is **two** files outside the
version directories, `schema/index.ts` (the schema) and `migration/migrations.ts` (the migration),
and that a migration is frozen once released, like the schema it produces.

- [ ] **Step 5: Make typecheck pass with the smallest business changes**

`src/business/types.ts`:

```ts
export type EquipmentItemData = CharacterDocument['equipment']['other'][number];
export type WeaponData = CharacterDocument['equipment']['weapons'][number];
export type WeaponAttackData = NonNullable<WeaponData['attack']>;
export type SpellcastingData = SpellListData['spellcasting'];
export type SpellcastingEntryData = NonNullable<SpellcastingData['intelligence']>;
```

(`SpellcastingData` goes after `SpellListData`.) In `src/business/equipment.ts`, only enough to
compile: type `#weapons` as `WeaponData[]`, and have `addWeapon` push `attack: null`. `WeaponBO`
itself is Task 3.

- [ ] **Step 6: Repoint the tests the bump breaks**

- `src/data/repository/indexedDbRepository.test.ts`: in "migrates a document written by an older
  schema version" and the "writes a migrated document back" `describe`, replace
  `docFor(ID_A, 'Sable')` with `v1DocFor(ID_A, 'Sable')`. Add one test beside them, using the
  **real** registry (no `registry` option): a `putRaw` of `v1DocFor(ID_A, 'Sable')`, then
  `list()`, then `getRaw(ID_A)` equals `migrateV1ToV2(v1DocFor(ID_A, 'Sable'))`.
- `src/data/remote/codec.test.ts:33`: the decoded document is now migrated. Expect
  `{ ok: true, doc: migrateV1ToV2(zahir), portrait: null }`. Update the comment near line 70 that
  says `schemaVersion` "is a literal `1`" to say `2`.
- `src/ui/fixtures.ts`: `sableJson`'s `schemaVersion: 2`.

Run `npm test`. Every other failure must be read, not patched. Expected: none beyond these. Any
test comparing a stored v1 document to itself is a real finding; report it.

- [ ] **Step 7: Prove they bite, then commit**

Bites:
- make the migration also copy `+5` into `attackBonus` → the Zahir and fixture tests fail
- make it mutate `input.equipment` in place → "does not mutate" fails
- drop the `MIGRATIONS` entry → the real-registry repository test fails

```bash
git add src/data/migration src/data/schema/index.ts src/data/schema/README.md src/test \
  src/data/repository/indexedDbRepository.test.ts src/data/remote/codec.test.ts \
  src/business/types.ts src/business/equipment.ts src/ui/fixtures.ts
git commit -m "feat(schema): migrate v1 to v2 and make v2 current"
```

---

### Task 3: `WeaponBO`

**Files:**
- Modify: `src/business/equipment.ts`, `src/business/guards.ts`, `src/business/errors.ts`,
  `src/business/index.ts`, `src/business/equipment.test.ts`, `src/business/guards.test.ts`,
  `src/business/characterSheet.roundTrip.test.ts`

**Interfaces:**
- Produces:
  - `interface WeaponAttack { ability: AbilityKey; attackBonus: number; damage: string }`
  - `interface NewWeapon extends NewEquipmentItem { attack?: WeaponAttack | null }`
  - `class WeaponBO extends EquipmentItemBO<WeaponData>`, with:
    - `get attack(): WeaponAttack | null`
    - `setAttackAbility(ability: AbilityKey | null)`
    - `setAttackBonus(n)`
    - `setAttackDamage(text)`
  - `EquipmentBO.weapons: WeaponBO[]`
  - `EquipmentBO.addWeapon(init: NewWeapon): WeaponBO`
  - `guards.ts`: `ABILITY_KEYS`, `abilityKey(value)`, `damageText(value)`
  - `RuleCode` gains `UNKNOWN_ABILITY`, `DUPLICATE_SPELLCASTING` and `NO_ATTACK`
- Consumers: `bind.ts` (Task 5).

- [ ] **Step 1: Write the failing tests**

`src/business/guards.test.ts`:
- `abilityKey`:
  - accepts all six
  - throws `UNKNOWN_ABILITY` for `'STR'` and `'luck'`
- `damageText`:
  - trims `'  1d8 '` to `'1d8'`
  - returns `''` for `'   '`
  - accepts 80 characters
  - throws `TOO_LONG` for 81 after trimming
- `ABILITY_KEYS` equals `Object.keys(createCharacter(...).abilitiesAndSkills.abilities)`, in order

`src/business/equipment.test.ts`, a new `describe('WeaponBO')`:

```ts
it('starts with no attack', () => {
  expect(sheetFor().equipment.addWeapon({ name: 'Rapier' }).attack).toBeNull();
});
it('creates the attack when the first ability is chosen, at +0 with no damage', () => {
  const rapier = sheetFor().equipment.addWeapon({ name: 'Rapier' });
  rapier.setAttackAbility('dexterity');
  expect(rapier.attack).toEqual({ ability: 'dexterity', attackBonus: 0, damage: '' });
});
it('keeps the bonus and damage when the ability changes', () => {
  const rapier = sheetFor().equipment.addWeapon({ name: 'Rapier' });
  rapier.setAttackAbility('strength');
  rapier.setAttackBonus(6);
  rapier.setAttackDamage('1d8+3 piercing');
  rapier.setAttackAbility('dexterity');
  expect(rapier.attack).toEqual({ ability: 'dexterity', attackBonus: 6, damage: '1d8+3 piercing' });
});
it('clears the whole attack when the ability is cleared', () => { /* set, then null → attack null */ });
it.each([['bonus', (w: WeaponBO) => w.setAttackBonus(1)], ['damage', (w: WeaponBO) => w.setAttackDamage('1d4')]])(
  'refuses a %s with no ability chosen (NO_ATTACK)', (_label, write) => { /* expect RuleViolation code */ });
it('refuses an unknown ability', () => { /* setAttackAbility('luck' as never) → UNKNOWN_ABILITY */ });
it('trims damage, allows it empty, and caps it at 80', () => { /* ... */ });
it('hands out a copy of the attack, never the stored object', () => {
  const sheet = sheetFor();
  const rapier = sheet.equipment.addWeapon({ name: 'Rapier', attack: { ability: 'dexterity', attackBonus: 6, damage: '' } });
  (rapier.attack as { attackBonus: number }).attackBonus = 99;
  expect(sheet.toDocument().equipment.weapons[0]?.attack?.attackBonus).toBe(6);
});
it('adds nothing when the new attack is invalid', () => {
  const sheet = sheetFor();
  expect(() => sheet.equipment.addWeapon({ name: 'Rapier', attack: { ability: 'luck' as never, attackBonus: 1, damage: '' } })).toThrow(RuleViolation);
  expect(sheet.equipment.weapons).toEqual([]);
});
it('never gives other equipment an attack key', () => {
  const sheet = sheetFor();
  sheet.equipment.addOther({ name: 'Cloak' });
  expect(sheet.toDocument().equipment.other[0]).not.toHaveProperty('attack');
});
it('keeps weapons as WeaponBO inside the derived lists', () => {
  const sheet = sheetFor();
  sheet.equipment.addWeapon({ name: 'Rapier', equipped: true });
  expect(sheet.equipment.equipped[0]).toBeInstanceOf(WeaponBO);
});
```

(Fill in the bodies marked `/* … */` in the same style; each asserts `RuleViolation` and its
`code`.)

`characterSheet.roundTrip.test.ts`:
- In `fill`, chain `.setAttackAbility('dexterity')`, `.setAttackBonus(6)` and
  `.setAttackDamage('1d8+3 piercing')` onto the Rapier. `addWeapon` returns the `WeaponBO`, so
  keep a local.
- In `overLongWrites`, add `['a weapon damage', (sheet) => sheet.equipment.weapons[0]?.setAttackDamage(LONG_NAME)]`.

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npx vitest run src/business`. Expect: `WeaponBO`, `abilityKey` and `damageText` do not
exist.

- [ ] **Step 3: Implement**

`src/business/errors.ts`: add `'UNKNOWN_ABILITY' | 'DUPLICATE_SPELLCASTING' | 'NO_ATTACK'` to
`RuleCode`, before `'GONE'`.

`src/business/guards.ts`:
- add `import type { AbilityKey } from './abilitiesAndSkills.js';`
- append:

```ts
// Duplicated rather than imported, like the limits at the top of this file and
// `SPELL_SLOT_LEVELS` in `counters.ts`: the tuple is a fact about one schema version, and
// `src/business/` may not import a version directory. Display order too — STR to CHA.
export const ABILITY_KEYS = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const satisfies readonly AbilityKey[];

/**
 * The type already restricts callers; this is the net for one it cannot reach — plain
 * JavaScript, or a cast — because a key the schema does not know makes the document unsaveable.
 */
export function abilityKey(value: string): AbilityKey {
  if (!(ABILITY_KEYS as readonly string[]).includes(value)) {
    throw new RuleViolation('UNKNOWN_ABILITY', `"${value}" is not an ability`);
  }
  return value as AbilityKey;
}

/**
 * A weapon's damage: trimmed at the write boundary, like a name, but allowed to be empty — no
 * damage entered yet — which is why this is not `trimmedName`. Capped at the short-name limit the
 * schema's `damageText` shares.
 */
export function damageText(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length > MAX_SHORT_NAME) {
    throw new RuleViolation(
      'TOO_LONG',
      `damage must be at most ${MAX_SHORT_NAME} characters, got ${trimmed.length}`,
    );
  }
  return trimmed;
}
```

`src/business/equipment.ts`:
- `EquipmentItemBO` becomes
  `class EquipmentItemBO<TData extends EquipmentItemData = EquipmentItemData> extends NamedItemBO<TData>`.
- Replace `addTo` with a pure `equipmentNode(init): EquipmentItemData`.
- `addOther` pushes `equipmentNode(init)`.
- `addWeapon`:

```ts
  addWeapon({ attack = null, ...init }: NewWeapon): WeaponBO {
    // Checked before anything is pushed, so a bad attack leaves no half-made weapon behind.
    const checked = attack === null ? null : weaponAttack(attack);
    const node = pushAndRead(this.#weapons, { ...equipmentNode(init), attack: checked });
    return new WeaponBO(node, this.#weapons);
  }
```

- `weapons` maps to `new WeaponBO(node, this.#weapons)`.
- Add:

```ts
/** A fresh object, so the caller's literal never becomes part of the document. */
function weaponAttack({ ability, attackBonus, damage }: WeaponAttack): WeaponAttackData {
  return { ability: abilityKey(ability), attackBonus: integer(attackBonus), damage: damageText(damage) };
}

/**
 * A weapon carries the attack roll the player enters — the ability, the bonus, the damage — and
 * the app checks none of it against anything. Choosing an ability is what creates the attack, so
 * nothing else can be set before one is chosen, and clearing the ability clears the rest.
 */
export class WeaponBO extends EquipmentItemBO<WeaponData> {
  /** `null` when no attack roll has been entered. A copy: the stored object never leaves. */
  get attack(): WeaponAttack | null {
    const { attack } = this.node;
    return attack === null ? null : { ...attack };
  }

  /**
   * A first choice starts at `+0` with no damage (spec §1, "Starting values"). A change keeps
   * both: the player picks the ability first and types the number second, and correcting the
   * first must not wipe the second.
   */
  setAttackAbility(value: AbilityKey | null): void {
    if (value === null) {
      this.node.attack = null;
      return;
    }
    const ability = abilityKey(value);
    if (this.node.attack === null) this.node.attack = { ability, attackBonus: 0, damage: '' };
    else this.node.attack.ability = ability;
  }

  setAttackBonus(value: number): void {
    this.#requireAttack().attackBonus = integer(value);
  }

  setAttackDamage(value: string): void {
    this.#requireAttack().damage = damageText(value);
  }

  #requireAttack(): WeaponAttackData {
    const { attack } = this.node;
    if (attack === null) {
      throw new RuleViolation('NO_ATTACK', `choose an attack ability for ${this.name} first`);
    }
    return attack;
  }
}
```

Validate the value before calling `#requireAttack()` if a test shows the order matters: a
`NOT_AN_INTEGER` on a weapon with no attack must still say `NOT_AN_INTEGER`.

`src/business/index.ts`: export `WeaponBO`, `type WeaponAttack` and `type NewWeapon` beside
`EquipmentItemBO`.

- [ ] **Step 4: Run the tests, prove they bite, commit**

Run `npm test`. Bites:
- return `this.node.attack` itself from `attack` → the copy test fails
- reset the bonus to 0 on every ability change → the "keeps" test fails
- skip `weaponAttack()` in `addWeapon` → the "adds nothing" test fails

Then `git stash drop stash@{0}`.

```bash
git add src/business/equipment.ts src/business/equipment.test.ts src/business/guards.ts \
  src/business/guards.test.ts src/business/errors.ts src/business/index.ts \
  src/business/characterSheet.roundTrip.test.ts
git commit -m "feat(business): record a weapon's attack roll, ability first"
```

---

### Task 4: `SpellcastingBO` and `SpellListBO`

**Files:**
- Create: `src/business/spellcasting.ts`, `src/business/spellcasting.test.ts`
- Modify: `src/business/spellList.ts`, `src/business/characterSheet.ts`, `src/business/index.ts`,
  `src/business/characterSheet.roundTrip.test.ts`

**Interfaces:**
- Produces:
  - `class SpellcastingBO`, with:
    - `get items(): SpellcastingEntryBO[]`, in STR→CHA order
    - `add(ability, { attackBonus, saveDc }): SpellcastingEntryBO`
  - `class SpellcastingEntryBO`, with:
    - `ability`
    - `attackBonus` / `setAttackBonus`
    - `saveDc` / `setSaveDc`
    - `remove()`
  - `class SpellListBO extends CategorizedBO<SpellData, SpellBO>`, with a readonly `spellcasting`
- Removes: `makeSpellList`, and the `SpellListBO` type alias.

- [ ] **Step 1: Write the failing tests**

`src/business/spellcasting.test.ts`, using the same `sheetFor()` as `spellList.test.ts`:
- starts empty
- `add('intelligence', { attackBonus: 6, saveDc: 14 })` reads back through the entry and through
  `sheet.toDocument().spellList.spellcasting`
- `items` is in STR→CHA order whatever the add order: add `charisma`, then `intelligence`, and
  expect `['intelligence', 'charisma']`
- a second `add('intelligence', …)` throws `DUPLICATE_SPELLCASTING` and leaves the first entry
  unchanged
- `add('luck' as never, …)` throws `UNKNOWN_ABILITY`
- a negative `saveDc` throws `NEGATIVE`
- a fractional `attackBonus` throws `NOT_AN_INTEGER`, on both `add` and the setters
- `setAttackBonus(-1)` is accepted
- `remove()` deletes the key, and a second `remove()` or a setter on that entry throws `GONE`
- an autorun over `sheet.spellList.spellcasting.items.length` sees `[0, 1, 0]` across an add and a
  remove, which shows the new key is observable

`characterSheet.roundTrip.test.ts` `fill`: add
`sheet.spellList.spellcasting.add('intelligence', { attackBonus: 6, saveDc: 14 })`.

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npx vitest run src/business/spellcasting.test.ts`. Expect: the module is not found.

- [ ] **Step 3: Implement**

`src/business/spellcasting.ts`:

```ts
import type { AbilityKey } from './abilitiesAndSkills.js';
import { RuleViolation } from './errors.js';
import { ABILITY_KEYS, abilityKey, integer, nonNegativeInt } from './guards.js';
import type { SpellcastingData, SpellcastingEntryData } from './types.js';

/**
 * One entry per spellcasting ability, keyed by it (spec §4.2). Like `HitDicesBO`: the record key
 * is the identity, so there is no id, and no business object holds an entry by reference.
 */
export class SpellcastingBO {
  readonly #record: SpellcastingData;

  constructor(record: SpellcastingData) {
    this.#record = record;
  }

  /** STR to CHA, the order every sheet prints abilities in — not the order they were added. */
  get items(): SpellcastingEntryBO[] {
    return ABILITY_KEYS.filter((key) => this.#record[key] !== undefined).map(
      (key) => new SpellcastingEntryBO(this.#record, key),
    );
  }

  /**
   * Takes the numbers with the ability, so an entry never exists before the player has seen its
   * fields. Everything is checked before the record is touched.
   */
  add(ability: AbilityKey, init: { attackBonus: number; saveDc: number }): SpellcastingEntryBO {
    const key = abilityKey(ability);
    const entry = { attackBonus: integer(init.attackBonus), saveDc: nonNegativeInt(init.saveDc) };
    if (this.#record[key] !== undefined) {
      throw new RuleViolation('DUPLICATE_SPELLCASTING', `${key} already has a spellcasting entry`);
    }
    this.#record[key] = entry;
    return new SpellcastingEntryBO(this.#record, key);
  }
}

export class SpellcastingEntryBO {
  readonly #record: SpellcastingData;
  readonly #key: AbilityKey;

  constructor(record: SpellcastingData, key: AbilityKey) {
    this.#record = record;
    this.#key = key;
  }

  get ability(): AbilityKey {
    return this.#key;
  }

  get attackBonus(): number {
    return this.#require().attackBonus;
  }

  setAttackBonus(value: number): void {
    const checked = integer(value);
    this.#require().attackBonus = checked;
  }

  get saveDc(): number {
    return this.#require().saveDc;
  }

  setSaveDc(value: number): void {
    const checked = nonNegativeInt(value);
    this.#require().saveDc = checked;
  }

  remove(): void {
    this.#require();
    delete this.#record[this.#key];
  }

  #require(): SpellcastingEntryData {
    const entry = this.#record[this.#key];
    if (entry === undefined) {
      throw new RuleViolation('GONE', `the ${this.#key} spellcasting entry is no longer in the document`);
    }
    return entry;
  }
}
```

`src/business/spellList.ts`: replace `makeSpellList` and the alias with:

```ts
/**
 * The categorized shape plus spellcasting, which sits beside the categories in the stored document
 * the way spell slots sit beside the counters' categories.
 */
export class SpellListBO extends CategorizedBO<SpellData, SpellBO> {
  readonly spellcasting: SpellcastingBO;

  constructor(node: SpellListData) {
    super(
      node,
      (item, siblings, owner) => new SpellBO(item, siblings, owner),
      ({ name, description = '' }: NewNamedItem): SpellData => ({
        id: createId(),
        name: trimmedName(name),
        description: longText(description),
        level: 'c',
        prepared: false,
      }),
    );
    this.spellcasting = new SpellcastingBO(node.spellcasting);
  }
}
```

`src/business/characterSheet.ts`: `this.spellList = new SpellListBO(this.#doc.spellList);`.

`src/business/index.ts`:
- export `SpellListBO` as a value
- export `SpellcastingBO` and `SpellcastingEntryBO` from `./spellcasting.js`
- update the header comment: `SpellListBO` is now a class, not an applied alias

- [ ] **Step 4: Run the tests, prove they bite, commit**

Run `npm test`. Bites:
- sort `items` by insertion order → the order test fails
- check the duplicate after writing → the duplicate test sees the first entry overwritten
- make `remove()` skip `#require()` → the second-remove test fails

```bash
git add src/business/spellcasting.ts src/business/spellcasting.test.ts src/business/spellList.ts \
  src/business/characterSheet.ts src/business/index.ts src/business/characterSheet.roundTrip.test.ts
git commit -m "feat(business): record spell attack and save DC per spellcasting ability"
```

---

### Task 5: `AbilityPicker`, types, binding, and the Equipment UI

**Files:**
- Create: `src/ui/components/AbilityPicker.tsx`, `src/ui/components/AbilityPicker.test.tsx`
- Modify:
  - `src/ui/reference.ts` (full names), `src/ui/format.ts` (`formatSigned`), `src/ui/types.ts`,
    `src/ui/bind.ts`
  - `src/ui/components/ItemRow.tsx` (a `lead` prop), `src/ui/screens/Equipment.tsx`,
    `src/ui/styles.css`
  - `src/ui/fixtures.ts`, `src/ui/screens/Equipment.stories.tsx`
  - `src/ui/bind.test.tsx`, `src/ui/screens/Equipment.test.tsx`

**Interfaces:**
- Produces:
  - `AbilityPicker({ label, value, onChange, allowNone?, disabled? })`
  - `WeaponAttackView`, `WeaponView`, `EquipmentActions.addWeapon` / `addOther`
  - `setWeaponAttackAbility`, `setWeaponAttackBonus`, `setWeaponAttackDamage(): NameResult`
- Removes: `EquipmentActions.addEquipment`.

- [ ] **Step 1: Write the failing tests**

`src/ui/components/AbilityPicker.test.tsx` (`// @vitest-environment jsdom`):
- renders a `radiogroup` named by `label`, containing six `radio`s STR…CHA
- a seventh, "None", appears only with `allowNone`
- exactly one radio has `aria-checked="true"`: the `value`, or None when `value` is `null`
- clicking DEX calls `onChange('dexterity')`, and clicking None calls `onChange(null)`
- a key in `disabled` renders a disabled radio, and clicking it calls nothing

`src/ui/screens/Equipment.test.tsx`:
- the Rapier fixture has `attack: { ability: 'dexterity', attackBonus: 6, damage: '1d8+3 piercing' }`
  and Shortbow has `attack: null`. The Rapier row shows `DEX` and `+6`, and its preview starts
  with `1d8+3 piercing · `. The Shortbow row shows neither.
- opening the Rapier shows the "Edit weapon" title, a checked DEX radio, an "Attack bonus" field
  reading `+6`, and a "Damage" field
- opening a weapon with no attack shows the picker with None checked, no "Attack bonus" field, and
  the hint text
- clicking None on the Rapier calls `setWeaponAttackAbility('e1', null)`
- typing `1d8+3 piercing` into Damage one character at a time does not call
  `setWeaponAttackDamage`; blur calls it once, with the full string. Use a spy `actions` object.
- opening the Cloak shows "Edit item" and no Attack ability group
- the New weapon dialog: fields hidden until DEX is clicked. Then type `+5` and ` 1d6 piercing `,
  click Create, and `addWeapon` receives
  `attack: { ability: 'dexterity', attackBonus: 5, damage: '1d6 piercing' }`.

`src/ui/bind.test.tsx`:
- in "mirrors every section", give the Rapier an attack, and expect
  `data.equipment.weapons[0].attack` and `data.equipment.equipped[0].attack` to equal it, read
  from `doc`
- in the actions test, replace the two `addEquipment` calls with `addWeapon` (with an attack) and
  `addOther`
- new assertions, against `sheet.toDocument()`:
  - `setWeaponAttackAbility`, `setWeaponAttackBonus`, `setWeaponAttackDamage` write through
  - `setWeaponAttackDamage(id, 'x'.repeat(81))` returns a message, not a throw

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npx vitest run src/ui`. Expect: type errors and missing exports, then assertion failures.

- [ ] **Step 3: Implement the pieces**

`src/ui/reference.ts`: each `ABILITIES` entry gains `name`, e.g.
`{ key: 'strength', short: 'STR', name: 'Strength' }`. Add an
`abilityOf(key)` lookup that returns the entry. If lint forbids a non-null assertion, look it up
from an object built once with `Object.fromEntries`.

`src/ui/format.ts`: add
`export const formatSigned = (n: number): string => (n >= 0 ? `+${n}` : String(n));`.

`src/ui/components/AbilityPicker.tsx`:

```tsx
import type { CSSProperties } from 'react';
import { ABILITIES } from '../reference.js';
import type { AbilityKey } from '../types.js';

interface Props {
  /** Names the group for assistive technology; the visible label is the dialog's own `dlabel`. */
  label: string;
  value: AbilityKey | null;
  onChange(value: AbilityKey | null): void;
  /** Adds a leading "None" — a weapon may have no attack; a spellcasting entry always has one. */
  allowNone?: boolean;
  /** Abilities that cannot be picked: spellcasting disables those that already have an entry. */
  disabled?: readonly AbilityKey[];
}

/**
 * One row of ability buttons, in the proficiency toggles' look (spec §5.3). Buttons rather than a
 * select: all the choices are visible at once, and the chosen one reads as the stat block does.
 */
export function AbilityPicker({ label, value, onChange, allowNone = false, disabled = [] }: Props) {
  const options: { key: AbilityKey | null; short: string }[] = [
    ...(allowNone ? [{ key: null, short: 'None' }] : []),
    ...ABILITIES,
  ];
  return (
    <div
      className="abpick"
      role="radiogroup"
      aria-label={label}
      style={{ '--n': options.length } as CSSProperties}
    >
      {options.map((option) => (
        <button
          key={option.key ?? 'none'}
          type="button"
          role="radio"
          aria-checked={value === option.key}
          disabled={option.key !== null && disabled.includes(option.key)}
          onClick={() => onChange(option.key)}
        >
          {option.short}
        </button>
      ))}
    </div>
  );
}
```

`src/ui/types.ts`, per spec §5.4:

```ts
export interface WeaponAttackView {
  ability: AbilityKey;
  attackBonus: number;
  damage: string;
}

/** A weapon is an equipment item plus its attack roll; only the Weapons list holds these. */
export interface WeaponView extends EquipmentItemView {
  attack: WeaponAttackView | null;
}

export interface EquipmentView {
  weapons: WeaponView[];
  other: EquipmentItemView[];
  attuned: (WeaponView | EquipmentItemView)[];
  equipped: (WeaponView | EquipmentItemView)[];
}

type NewEquipmentItem = { name: string; description: string; attuned: boolean; equipped: boolean };

export interface EquipmentActions {
  addWeapon(item: NewEquipmentItem & { attack: WeaponAttackView | null }): void;
  addOther(item: NewEquipmentItem): void;
  renameEquipment(id: string, name: string): NameResult;
  setEquipmentDescription(id: string, description: string): void;
  setAttuned(id: string, attuned: boolean): void;
  setEquipped(id: string, equipped: boolean): void;
  removeEquipment(id: string): void;
  setWeaponAttackAbility(id: string, ability: AbilityKey | null): void;
  setWeaponAttackBonus(id: string, value: number): void;
  /** Rejectable: damage over 80 characters is `TOO_LONG`. */
  setWeaponAttackDamage(id: string, damage: string): NameResult;
}
```

Delete `EquipmentSlot` if nothing else uses it after Step 4; otherwise keep it.

`src/ui/bind.ts`:
- import `WeaponBO`
- add `const weaponView = (item: WeaponBO): WeaponView => ({ ...equipmentItemView(item), attack: item.attack });`
- add `const anyEquipmentView = (item: EquipmentItemBO) => (item instanceof WeaponBO ? weaponView(item) : equipmentItemView(item));`
- `equipmentView`: `weapons` uses `weaponView`, `other` uses `equipmentItemView`, and `attuned` and
  `equipped` use `anyEquipmentView`
- `equipmentActions`:

```ts
  const weapon = (id: string) => byId(bo.weapons, id, 'weapon');
  // …
    addWeapon: (init) => {
      bo.addWeapon(init);
    },
    addOther: (init) => {
      bo.addOther(init);
    },
    setWeaponAttackAbility: (id, ability) => weapon(id).setAttackAbility(ability),
    setWeaponAttackBonus: (id, value) => weapon(id).setAttackBonus(value),
    setWeaponAttackDamage: (id, damage) => attempt(() => weapon(id).setAttackDamage(damage)),
```

`src/ui/components/ItemRow.tsx`: add an optional `lead?: string` prop, documented as "Shown in
ink at the head of the preview: a weapon's damage". Render the preview as:

```tsx
{(lead || preview !== '') && (
  <span className="pv">
    {lead && <span className="dmg">{lead}</span>}
    {lead && preview !== '' && ' · '}
    {preview}
  </span>
)}
```

`src/ui/styles.css`: append, exactly as in the approved mockups:

```css
/* ---------- attack rolls: weapons ---------- */
/* On the row: the ability as the skill rows' grey tag, the bonus bold beside it. */
.atk {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}
.atk .ab {
  font-size: 9.5px;
  font-weight: 800;
  color: var(--ink-2);
  background: var(--fill);
  border-radius: 5px;
  padding: 2px 5px;
}
.atk .b {
  font-size: 15px;
  font-weight: 800;
}
/* Damage leads the preview line, in ink, so it reads before the description. */
.recopen .pv .dmg {
  color: var(--ink);
  font-weight: 600;
}
/* The proficiency toggles' look (.mk), laid out as one row of choices. */
.abpick {
  display: grid;
  grid-template-columns: repeat(var(--n, 6), 1fr);
  gap: 5px;
}
.abpick button {
  height: 34px;
  border-radius: 8px;
  border: 1.5px solid var(--line);
  background: var(--paper);
  color: var(--ink-2);
  font: inherit;
  font-size: 11.5px;
  font-weight: 800;
  padding: 0;
  cursor: pointer;
}
.abpick button[aria-checked='true'] {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.abpick button:disabled {
  opacity: 0.35;
  cursor: default;
}
/* Attack bonus narrow, damage wide: a bonus is two characters, damage is a phrase. */
.atkfields {
  display: grid;
  grid-template-columns: 92px 1fr;
  gap: 10px;
  margin-top: 12px;
}
.atkfields .inp.signed {
  text-align: center;
  font-weight: 700;
}
.hint.tight {
  margin-top: 6px;
}
/* Attuned and Equipped side by side: the attack takes the height they gave up. */
.chkpair {
  display: flex;
  gap: 28px;
}
/* A weapon's key facts now sit in its attack, so its description starts shorter. It still grows
   with its text (field-sizing: content), up to the same 60dvh as every other description. */
.dialog .area.brief {
  min-height: 4lh;
}
```

- [ ] **Step 4: The Equipment screen**

`src/ui/screens/Equipment.tsx`:
- `const isWeapon = (item: EquipmentItemView): item is WeaponView => 'attack' in item;`
- `row(item)` passes:
  - `lead={isWeapon(item) ? item.attack?.damage || undefined : undefined}`
  - `after` = `<span className="atk"><span className="ab">{abilityOf(a.ability).short}</span><span className="b">{formatSigned(a.attackBonus)}</span></span>`,
    when the item has an attack
- the Dialog state stays `{ kind: 'new'; slot }`. `NewEquipmentDialog` takes both `onCreateWeapon`
  and `onCreateOther`, and calls the one for its slot.
- **`WeaponAttackFields`** is a local component with two modes:
  - **Live**, for edit: the picker calls `setWeaponAttackAbility` at once. The bonus is a signed
    `NumberField`. Damage is a `NameField` with placeholder `e.g. 1d8+3 piercing`, committing
    through `setWeaponAttackDamage`.
  - **Local**, for new: state is `attack: WeaponAttackView | null`. The picker keeps the bonus and
    damage when switching abilities, matching `WeaponBO`. Damage is a plain `<input>` with
    `maxLength={80}`, trimmed on Create.

  Layout, top to bottom, exactly as the mockup:
  1. `<span className="dlabel mt12">Attack ability</span>`
  2. `<AbilityPicker label="Attack ability" allowNone …/>`
  3. either the `.atkfields` grid with its two labelled fields and the hint "None clears the attack
     bonus and damage.", or, when `attack` is `null`, only the hint "Pick the ability you attack
     with to enter the attack bonus and damage." Both hints use `className="hint tight"`.
- **Both dialogs:**
  - titled "Edit weapon" / "New weapon" when it is a weapon, else "Edit item" / "New equipment"
  - attack fields between Name and Description, for weapons only
  - the textarea is `className={weapon ? 'area brief' : 'area'}`
  - both `CheckRow`s wrapped in `<div className="chkpair">` for every item

`src/ui/fixtures.ts`:
- `weapons` becomes `WeaponView[]`:
  - Rapier: `attack: { ability: 'dexterity', attackBonus: 6, damage: '1d8+3 piercing' }`
  - Shortbow: `attack: null`
  - Dagger: `attack: { ability: 'dexterity', attackBonus: 6, damage: '1d4+3 piercing' }`
- `noEquipmentActions` gets the new keys and drops `addEquipment`

`Equipment.stories.tsx` needs no new story: the fixture now covers both row kinds. Check that it
still typechecks.

- [ ] **Step 5: Run the tests, prove they bite, look at it, commit**

Run `npm test`, `npm run typecheck` and `npm run lint`. Bites:
- make Damage commit on every change → the typing test fails
- drop `instanceof WeaponBO` from `anyEquipmentView` → the Equipped-attack assertion fails
- render the picker for Other items → the Cloak test fails

Then `npm run dev`, open a seeded character's Equipment at a 390 px viewport, and compare it with
`2026-09-26-attack-rolls-mockups/equipment.png`. Report any difference.

```bash
git add src/ui/components/AbilityPicker.tsx src/ui/components/AbilityPicker.test.tsx \
  src/ui/components/ItemRow.tsx src/ui/reference.ts src/ui/format.ts src/ui/types.ts src/ui/bind.ts \
  src/ui/bind.test.tsx src/ui/screens/Equipment.tsx src/ui/screens/Equipment.test.tsx \
  src/ui/styles.css src/ui/fixtures.ts
git commit -m "feat(ui): weapon attack on the row and an ability picker in the weapon dialogs"
```

---

### Task 6: The Spell List chips and dialogs

**Files:**
- Create: `src/ui/screens/SpellList.test.tsx`
- Modify: `src/ui/types.ts`, `src/ui/bind.ts`, `src/ui/bind.test.tsx`,
  `src/ui/screens/SpellList.tsx`, `src/ui/screens/SpellList.stories.tsx`, `src/ui/styles.css`,
  `src/ui/fixtures.ts`

**Interfaces:**
- Produces:
  - `SpellcastingView`
  - `SpellListView extends CategorizedView<SpellView> { spellcasting: SpellcastingView[] }`
  - `SpellListActions` gains `addSpellcasting`, `setSpellAttackBonus`, `setSpellSaveDc` and
    `removeSpellcasting`

- [ ] **Step 1: Write the failing tests**

`src/ui/screens/SpellList.test.tsx` (jsdom). Render with a spy `actions`, then:
- with `spellcasting: []`: the text "No spellcasting ability yet — tap “Add”." and a "+ Add" button
- with INT and CHA entries: two buttons named `Intelligence spellcasting: attack +6, save DC 14`
  and `Charisma spellcasting: attack +4, save DC 12`, in that order
- "+ Add" opens "Add spellcasting":
  - INT and CHA radios are disabled
  - Create is disabled
  - no "Spell attack" field until WIS is clicked
  - then type `+4` and `12`, click Create, and `addSpellcasting('wisdom', { attackBonus: 4, saveDc: 12 })`
    is called once
- with all six entries there is no "+ Add" button
- clicking the INT chip opens a dialog titled "Intelligence":
  - editing Spell attack to `+7` calls `setSpellAttackBonus('intelligence', 7)`
  - Delete, then confirm, calls `removeSpellcasting('intelligence')`

`src/ui/bind.test.tsx`:
- "mirrors every section" adds INT spellcasting, and expects `data.spellList.spellcasting` to be
  `[{ ability: 'intelligence', attackBonus: 6, saveDc: 14 }]`
- the actions test drives all four new actions and asserts `doc.spellList.spellcasting`

- [ ] **Step 2: Run the tests to watch them fail**

Run: `npx vitest run src/ui`.

- [ ] **Step 3: Implement**

`src/ui/types.ts`:

```ts
export interface SpellcastingView {
  ability: AbilityKey;
  attackBonus: number;
  saveDc: number;
}

/** The spell categories, plus spellcasting beside them — the way `CountersView` adds its slots. */
export interface SpellListView extends CategorizedView<SpellView> {
  /** STR to CHA, present abilities only. */
  spellcasting: SpellcastingView[];
}
```

Add to `SpellListActions`:

```ts
  /** The picker offers only unused abilities, so a duplicate is a bug and stays loud. */
  addSpellcasting(ability: AbilityKey, init: { attackBonus: number; saveDc: number }): void;
  setSpellAttackBonus(ability: AbilityKey, value: number): void;
  setSpellSaveDc(ability: AbilityKey, value: number): void;
  removeSpellcasting(ability: AbilityKey): void;
```

`src/ui/bind.ts`:
- `spellListView` adds
  `spellcasting: sheet.spellList.spellcasting.items.map((e) => ({ ability: e.ability, attackBonus: e.attackBonus, saveDc: e.saveDc }))`
- `spellListActions`:

```ts
  // Keyed by ability, like the spell slots are by level: no id.
  const casting = (ability: AbilityKey) => {
    const found = bo.spellcasting.items.find((entry) => entry.ability === ability);
    if (found === undefined) {
      throw new RuleViolation('GONE', `there is no ${ability} spellcasting entry`);
    }
    return found;
  };
  // …
    addSpellcasting: (ability, init) => {
      bo.spellcasting.add(ability, init);
    },
    setSpellAttackBonus: (ability, value) => casting(ability).setAttackBonus(value),
    setSpellSaveDc: (ability, value) => casting(ability).setSaveDc(value),
    removeSpellcasting: (ability) => casting(ability).remove(),
```

`src/ui/screens/SpellList.tsx`:
- Extend `Dialog` with `| { kind: 'addCasting' } | { kind: 'editCasting'; ability: AbilityKey }`.
- Pass `CategorizedSection` these children:

```tsx
<div className="sechead-row">
  <span className="sechead static">Spellcasting</span>
  {data.spellcasting.length < ABILITIES.length && (
    <button type="button" className="txtbtn" onClick={() => setDialog({ kind: 'addCasting' })}>
      + Add
    </button>
  )}
</div>
{data.spellcasting.length === 0 ? (
  <div className="castempty">No spellcasting ability yet — tap “Add”.</div>
) : (
  // Wraps, never scrolls (spec §5.1): a hidden chip would hide a number needed every turn.
  <div className="castchips">
    {data.spellcasting.map((entry) => {
      const ability = abilityOf(entry.ability);
      return (
        <button
          key={entry.ability}
          type="button"
          className="castchip"
          aria-label={`${ability.name} spellcasting: attack ${formatSigned(entry.attackBonus)}, save DC ${entry.saveDc}`}
          onClick={() => setDialog({ kind: 'editCasting', ability: entry.ability })}
        >
          <span className="ab">{ability.short}</span>
          <span className="tl">Atk</span>
          <b>{formatSigned(entry.attackBonus)}</b>
          <span className="sep" aria-hidden="true">|</span>
          <span className="tl">DC</span>
          <b>{entry.saveDc}</b>
        </button>
      );
    })}
  </div>
)}
```

- **`AddSpellcastingDialog`**:
  - local `ability: AbilityKey | null`, `attackBonus` and `saveDc`, both 0
  - `<AbilityPicker label="Ability" disabled={used} …/>`
  - the hint "Pick the ability you cast with." plus, for each disabled ability, " {Name} already has
    an entry." (join them when there are several)
  - when `ability !== null`: a `.row2` with signed "Spell attack" and unsigned "Save DC"
    `NumberField`s (`className="inp"`)
  - footer: Create, disabled while `ability === null`, calling
    `actions.addSpellcasting(ability, { attackBonus, saveDc })` and closing
- **`EditSpellcastingDialog`**:
  - resolves the entry from `data.spellcasting` by ability, and unmounts if it is gone, like
    `editing`
  - titled `abilityOf(ability).name`
  - the hint "Spellcasting with {Name}. To use another ability, delete this and add one."
  - a `.row2` with live `NumberField`s calling `setSpellAttackBonus` and `setSpellSaveDc`
  - footer: `<ConfirmDelete what={`${Name} spellcasting`}>Delete</ConfirmDelete>`

`src/ui/styles.css`: append, exactly as in the approved mockups:

```css
/* ---------- attack rolls: spellcasting ---------- */
/* One chip per ability; the row wraps, never scrolls (spec §5.1). */
.castchips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.castchip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--line);
  background: var(--fill-2);
  border-radius: 10px;
  padding: 6px 10px;
  font: inherit;
  font-size: 13px;
  color: var(--ink);
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}
.castchip .ab {
  font-size: 9.5px;
  font-weight: 800;
  color: var(--ink-2);
  background: var(--fill);
  border-radius: 5px;
  padding: 2px 5px;
}
.castchip .tl {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--ink-2);
  font-weight: 700;
}
.castchip b {
  font-size: 15px;
  font-weight: 800;
}
.castchip .sep {
  color: var(--line);
}
.castempty {
  font-size: 13px;
  color: var(--ink-2);
  font-style: italic;
  opacity: 0.6;
}
```

`src/ui/fixtures.ts`:
- `spellList` gains
  `spellcasting: [{ ability: 'intelligence', attackBonus: 6, saveDc: 14 }]`
- `noSpellListActions` gets the four new keys

`SpellList.stories.tsx`:
- `Empty` adds `spellcasting: []`
- add a story `ThreeCasters`, with INT, WIS and CHA, to show the wrap

- [ ] **Step 4: Run the tests, prove they bite, look at it, commit**

Run `npm test`, `npm run typecheck` and `npm run lint`. Bites:
- render all six radios enabled → the disabled-ability test fails
- show "+ Add" at six → its test fails
- drop the `aria-label` on the chip → the chip-name test fails

`npm run dev`: compare with `2026-09-26-attack-rolls-mockups/spell-list.png` at 390 px, including
three chips wrapping.

```bash
git add src/ui/types.ts src/ui/bind.ts src/ui/bind.test.tsx src/ui/screens/SpellList.tsx \
  src/ui/screens/SpellList.test.tsx src/ui/screens/SpellList.stories.tsx src/ui/styles.css \
  src/ui/fixtures.ts
git commit -m "feat(ui): spellcasting chips on the Spell List"
```

---

### Task 7: Dev seed, docs, and a real-browser check

**Files:**
- Modify: `src/devSeed.ts`, `AGENTS.md`, `docs/BACKLOG.md` (only if something was deferred)

- [ ] **Step 1: Seed the feature**

`src/devSeed.ts`, through the business API only:
- **Sable:**
  - Rapier and Dagger get `attack: { ability: 'dexterity', attackBonus: 6, damage: '1d8+3 piercing' | '1d4+3 piercing' }`
  - Shortbow stays without one, so the no-attack row is visible
  - `spellcasting.add('intelligence', { attackBonus: 6, saveDc: 14 })`
- **Thorne:** Greatsword with `strength`, `+7`, `2d6+4 slashing`, and no spellcasting, so the empty
  hint shows
- **Wren:** `spellcasting.add('wisdom', { attackBonus: 5, saveDc: 13 })`

- [ ] **Step 2: Verify in a real browser**

In Chromium at 390 × 844 (Playwright at `/opt/pw-browsers`, or a desktop browser's device mode):
- **Reseed.** Open Sable's Spell List and Equipment and compare with the mockups.
- **Edit a weapon:**
  - change its ability STR → DEX and check the bonus is kept
  - type damage with a space and check it survives blur
  - pick None and check the attack clears
  - reload, and check every value persisted
- **Migration:**
  1. Clear storage.
  2. Import `testAssets/zahir-ibn-talaar-2026-09-24.json` (a v1 file).
  3. Check that its weapons show no attack and its Spell List shows the empty hint.
  4. Check that the raw-JSON screen shows `"schemaVersion": 2`, `"attack": null` and
     `"spellcasting": {}`.
- Report what you ran and what you saw.

- [ ] **Step 3: Docs**

`AGENTS.md`, "Current state":
- a short entry for schema v2 and the attack rolls feature, pointing at the spec, and noting:
  - v1 is now frozen and v2 is current
  - migrations are frozen once released
  - `AbilityPicker` exists
- update the test counts from an actual `npm test` run
- add `spellcasting.ts` to the Map, and note under `equipment.ts` that it holds `WeaponBO`

`docs/BACKLOG.md`: add an entry only for something consciously deferred during the build.

- [ ] **Step 4: Final checks and commit**

`npm test`, `npm run typecheck`, `npm run lint`, `npx prettier --check .` and `npm run build`:
all clean. Grep `dist/` for `devSeed` to confirm it is still dead code.

```bash
git add src/devSeed.ts AGENTS.md
git commit -m "docs: record schema v2 and attack rolls; seed them for npm run dev"
git push -u origin claude/dnd-attack-roll-calculations-omg43t
```
