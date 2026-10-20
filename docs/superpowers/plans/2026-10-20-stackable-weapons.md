# Stackable Weapons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A weapon can carry a count (`count: number | null`, `null` = not stackable), edited from
the weapon row and from a Stackable checkbox in the weapon dialogs, stored in character schema v6.

**Architecture:** A new frozen-on-release schema directory `src/data/schema/v6/` (copy of `v5/`)
adds `count` to the weapon item; `migrateV5ToV6` gives every weapon `count: null`. `WeaponBO`
gains `count`, derived `stackable`, `setStackable`, `setCount`, mirroring the attack roll's
"ability first" pattern with a `NOT_STACKABLE` rule. `bind.ts` maps them onto `WeaponView.count`
and two new actions; `Equipment.tsx` draws the count on the row and the checkbox in the dialogs.

**Tech Stack:** TypeScript 6, Zod 4.4.3, MobX 7, React, Vitest 4 + Testing Library, ESLint 10.

**Spec:** `docs/superpowers/specs/2026-10-20-stackable-weapons-design.md`

## Global Constraints

- The app computes nothing: no count is ever derived from a name or description, nothing decrements.
- `src/data/schema/v5/` and every older version directory are frozen: never edit them.
- A released migration is frozen; `migrateV5ToV6` reads nothing but the weapons it extends.
- Every object schema is `.strict()`; `count` is a **required** key, `nonNegativeInt.nullable()`.
- `count` goes **last** in a weapon object, in the business layer and the migration alike.
- Only weapons. `equipment.other[]` items never get a `count` key.
- Unticking Stackable clears the count with **no confirmation**.
- Row order: name, count field, attack badge (far right).
- Dialog: the Stackable row sits **directly under Name**, Count beside the checkbox while ticked.
- Ticking Stackable starts the count at **0**.
- Before every commit: `npm test`, `npm run typecheck`, `npm run lint`, `npx prettier --check .`.
- Every new test is broken once on purpose to prove it bites, then restored.
- Commit messages: Conventional Commit prefixes, ending with the session's attribution lines.

---

## File map

| File | Change |
|---|---|
| `src/data/schema/v6/*` | Create: copy of `v5/`, renamed, `count` on weapons |
| `src/data/schema/index.ts` | `CURRENT = 6`, `SCHEMAS[6]`, aliases to v6 |
| `src/data/migration/v5ToV6.ts` (+ test) | Create: the migration |
| `src/data/migration/migrations.ts` | Register `[5, migrateV5ToV6]` |
| `src/test/fixtures.ts`, `fixtures.test.ts` | `v5DocFor` with the bait |
| `src/data/remote/codec.test.ts`, `src/data/repository/indexedDbRepository.test.ts` | Extend the pinned chain to v6 |
| `src/business/errors.ts` | `NOT_STACKABLE` |
| `src/business/equipment.ts` (+ test) | `count`, `stackable`, `setStackable`, `setCount`, `NewWeapon.count` |
| `src/business/characterSheet.roundTrip.test.ts` | Fill a weapon count |
| `src/ui/types.ts` | `WeaponView.count`, two actions, `addWeapon` count |
| `src/ui/bind.ts` (+ `bind.test.tsx`) | Map them |
| `src/ui/fixtures.ts` | `noEquipmentActions` entries; Dagger with `count: 2` |
| `src/ui/screens/Equipment.tsx` (+ test) | Row count, Stackable row in both weapon dialogs |
| `src/ui/styles.css` | `.stackrow` |
| `src/devSeed.ts` | Dagger with a count |
| `AGENTS.md`, the spec | Record v6 |

---

### Task 1: Schema v6

**Files:**
- Create: `src/data/schema/v6/{blank,blank.test,document,document.test,index,primitives,primitives.test}.ts` (copied from `v5/`)

**Interfaces:**
- Produces: `characterDocumentV6Schema`, `CharacterDocumentV6`, `createCharacter` (v6) from `./v6/index.js`

- [ ] **Step 1: Copy and rename**

```bash
cp -r src/data/schema/v5 src/data/schema/v6
cd src/data/schema/v6
sed -i 's/characterDocumentV5Schema/characterDocumentV6Schema/g; s/CharacterDocumentV5/CharacterDocumentV6/g' *.ts
sed -i 's/^\/\/ Schema v5, frozen from its first release: this file defines what a v5 character/\/\/ Schema v6, frozen from its first release: this file defines what a v6 character/' *.ts
sed -i 's/^\/\/ Schema v5, frozen from its first release: these tests lock in what a v5 character/\/\/ Schema v6, frozen from its first release: these tests lock in what a v6 character/' *.ts
sed -i "s/^\/\/ allowed to be. Editing an assertion here to let new code pass is editing v5's meaning/\/\/ allowed to be. Editing an assertion here to let new code pass is editing v6's meaning/" *.ts
sed -i 's/schemaVersion: z.literal(5)/schemaVersion: z.literal(6)/' document.ts
sed -i 's/schemaVersion: 5,/schemaVersion: 6,/' blank.ts
sed -i 's/schemaVersion: 5 as const/schemaVersion: 6 as const/' document.test.ts
```

Then by hand in `document.test.ts`: `'requires schemaVersion to be exactly 5'` → `6`, its
`schemaVersion: 4` → `5`. In `blank.test.ts`: `'passes the v5 schema'` → `v6`,
`toBe(5)` → `toBe(6)`, and the key-order comment's `migrateV4ToV5` → `migrateV5ToV6`. Check
with `grep -n "v5\|V5\|\b5\b" src/data/schema/v6/*.ts` that every remaining `v5` is a historical
"v5 added …" note, not an identity.

- [ ] **Step 2: Write the failing tests** in `src/data/schema/v6/document.test.ts`

Give both fixture weapons a `count` (Rapier `null`, Improvised club `3`) in `validDocument()`,
typed `as number | null`. Then add, after the "does not accept an attack on other equipment"
test:

```ts
  it('requires a count key on every weapon: "not stackable" is null, never a missing key', () => {
    const doc = validDocument();
    delete (doc.equipment.weapons[0] as Record<string, unknown>).count;
    expect(characterDocumentV6Schema.safeParse(doc).success).toBe(false);
  });

  describe('a weapon count', () => {
    const withCount = (value: unknown) => {
      const doc = validDocument();
      (doc.equipment.weapons[0] as Record<string, unknown>).count = value;
      return doc;
    };

    // 0 is a stackable weapon with none left, not "not stackable".
    it.each([null, 0, 12])('accepts %j', (value) => {
      expect(characterDocumentV6Schema.safeParse(withCount(value)).success).toBe(true);
    });

    it.each([-1, 1.5, '3', true])('rejects %j: null or a whole number from 0', (value) => {
      expect(characterDocumentV6Schema.safeParse(withCount(value)).success).toBe(false);
    });
  });

  it('does not accept a count on other equipment — only weapons carry one', () => {
    const doc = validDocument();
    (doc.equipment.other[0] as Record<string, unknown>).count = null;
    expect(characterDocumentV6Schema.safeParse(doc).success).toBe(false);
  });
```

- [ ] **Step 3: Run, expect failures**

Run: `npx vitest run src/data/schema/v6`
Expected: FAIL — the fixture's `count` keys are unknown to a strict v5-shaped weapon.

- [ ] **Step 4: Implement** in `src/data/schema/v6/document.ts`

```ts
/**
 * v6. How many of this weapon the player carries — javelins, daggers, darts — entered by them
 * and decremented by nothing. `null` is "not stackable", which every weapon migrated from v5
 * carries; 0 is a stackable weapon with none left. Nothing stores "stackable" itself: it is
 * `count !== null`, so the two cannot disagree. Required, like `attack`, and last.
 */
const weaponItem = equipmentItem
  .extend({ attack: weaponAttack.nullable(), count: nonNegativeInt.nullable() })
  .strict();
```

- [ ] **Step 5: Run, expect pass**; break `count` to `nonNegativeInt.optional().nullable()` and
  watch the missing-key test alone fail; restore.

- [ ] **Step 6: Commit** — `feat(schema): add v6 with weapon counts`

---

### Task 2: Migration v5 → v6, and v6 current

**Files:**
- Create: `src/data/migration/v5ToV6.ts`, `src/data/migration/v5ToV6.test.ts`
- Modify: `src/data/migration/migrations.ts`, `src/data/schema/index.ts`, `src/test/fixtures.ts`,
  `src/test/fixtures.test.ts`, `src/data/remote/codec.test.ts`,
  `src/data/repository/indexedDbRepository.test.ts`, `src/business/equipment.ts` (compile fix)

**Interfaces:**
- Consumes: `characterDocumentV6Schema`, `CharacterDocumentV6`, `createCharacter` from Task 1
- Produces: `migrateV5ToV6: Migration`; `v5DocFor(id, name): Record<string, unknown>`;
  `CharacterDocument` now v6 (`WeaponData` gains `count: number | null`)

- [ ] **Step 1: `v5DocFor`** in `src/test/fixtures.ts`, after `v4DocFor`:

```ts
const V5_JAVELINS_ID = 'abababab-abab-4bab-8bab-abababababab';
const V5_JAVELIN_ITEM_ID = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';

/**
 * A complete v5 document: `v4DocFor` with the pact slots v5 added, filled in (3rd level, 1 of 2)
 * rather than left empty, plus a weapon "Javelins" described as "5 javelins" and an inventory
 * item "Javelins" counting 5. Those two are bait: a v5 → v6 migration that filled in a weapon's
 * count from either would show up here. `fixtures.test.ts` checks it against `SCHEMAS[5]`.
 */
export function v5DocFor(id: string, name: string): Record<string, unknown> {
  const v4 = v4DocFor(id, name) as {
    inventory: { items: object[] };
    equipment: { weapons: object[] };
    counters: object;
  };
  return {
    ...v4,
    schemaVersion: 5,
    inventory: {
      ...v4.inventory,
      items: [
        ...v4.inventory.items,
        { id: V5_JAVELIN_ITEM_ID, name: 'Javelins', description: '', count: 5 },
      ],
    },
    equipment: {
      ...v4.equipment,
      weapons: [
        ...v4.equipment.weapons,
        {
          id: V5_JAVELINS_ID,
          name: 'Javelins',
          description: '5 javelins',
          attuned: false,
          equipped: true,
          attack: { ability: 'strength', attackBonus: 5, damage: '1d6+3 piercing' },
        },
      ],
    },
    counters: { ...v4.counters, pactSlots: { level: 3, current: 1, total: 2 } },
  };
}
```

And in `fixtures.test.ts`:

```ts
describe('v5DocFor', () => {
  it('is a valid v5 document, so a migration test cannot pass on bad input', () => {
    expect(SCHEMAS[5]!.safeParse(v5DocFor(ID_A, 'Sable')).success).toBe(true);
  });
});
```

- [ ] **Step 2: Failing migration test** `src/data/migration/v5ToV6.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import { CURRENT, SCHEMAS } from '../schema/index.js';
import { ID_A, v5DocFor } from '../../test/fixtures.js';
import { parseCharacter } from './parseCharacter.js';
import { migrateV5ToV6 } from './v5ToV6.js';

interface Weapons {
  equipment: { weapons: Record<string, unknown>[]; other: Record<string, unknown>[] };
}

describe('migrateV5ToV6', () => {
  it('gives every weapon a null count and changes nothing else', () => {
    const v5 = v5DocFor(ID_A, 'Sable') as Record<string, unknown> & Weapons;
    expect(migrateV5ToV6(v5)).toEqual({
      ...v5,
      schemaVersion: 6,
      equipment: {
        ...v5.equipment,
        weapons: v5.equipment.weapons.map((weapon) => ({ ...weapon, count: null })),
      },
    });
  });

  it('reads neither a weapon description nor an inventory item of the same name', () => {
    const v5 = v5DocFor(ID_A, 'Sable') as Weapons & { inventory: { items: { name: string }[] } };
    // The bait is really there, so the assertion below means something.
    expect(v5.equipment.weapons.map((weapon) => weapon.description)).toContain('5 javelins');
    expect(v5.inventory.items.map((item) => item.name)).toContain('Javelins');

    const v6 = migrateV5ToV6(v5) as Weapons;
    expect(v6.equipment.weapons.map((weapon) => weapon.count)).toEqual([null, null]);
  });

  it('puts the count last in each weapon, and gives other equipment none', () => {
    const v6 = migrateV5ToV6(v5DocFor(ID_A, 'Sable')) as Weapons;
    for (const weapon of v6.equipment.weapons) {
      expect(Object.keys(weapon).at(-1)).toBe('count');
    }
    expect(v6.equipment.other[0]).not.toHaveProperty('count');
  });

  it('produces a valid v6 document', () => {
    expect(SCHEMAS[6]!.safeParse(migrateV5ToV6(v5DocFor(ID_A, 'Sable'))).success).toBe(true);
  });

  it('does not mutate its input', () => {
    const v5 = v5DocFor(ID_A, 'Sable');
    const before = structuredClone(v5);
    migrateV5ToV6(v5);
    expect(v5).toEqual(before);
  });
});

describe('parseCharacter on a v5 document', () => {
  // Asserts this step ran, not where the chain ends, so the next version does not break it.
  it('runs it through this migration on the way to the current version', () => {
    const result = parseCharacter(v5DocFor(ID_A, 'Sable'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.schemaVersion).toBe(CURRENT);
      expect(result.doc.equipment.weapons.map((weapon) => weapon.count)).toEqual([null, null]);
      expect(result.doc.counters.pactSlots).toEqual({ level: 3, current: 1, total: 2 });
    }
  });
});
```

- [ ] **Step 3: Run** `npx vitest run src/data/migration/v5ToV6.test.ts src/test/fixtures.test.ts`
  — expected FAIL: `./v5ToV6.js` does not exist.

- [ ] **Step 4: Implement** `src/data/migration/v5ToV6.ts`

```ts
import type { Migration } from './migrations.js';

/**
 * v5 → v6 (2026-10-20): every weapon gains `count: null` — not stackable.
 *
 * Reads nothing else. A weapon described as "5 javelins", or an inventory item of the same name,
 * is the player's own note, not data: the app never fills in a number the player did not enter,
 * and a migration is no exception.
 *
 * Last in each weapon, where the business layer puts it on a new one, so a plain spread puts it
 * there. Other equipment has no count and is left alone. The walk has already validated the
 * input at v5, so `equipment.weapons` is known to be an array of objects.
 *
 * Frozen once released, like the schema it produces: cloud versions are never rewritten, so a v5
 * backup goes through this function on every restore, forever. Builds new objects rather than
 * editing its input.
 */
export const migrateV5ToV6: Migration = (input) => {
  const doc = input as Record<string, unknown> & {
    equipment: { weapons: Record<string, unknown>[] };
  };
  return {
    ...doc,
    schemaVersion: 6,
    equipment: {
      ...doc.equipment,
      weapons: doc.equipment.weapons.map((weapon) => ({ ...weapon, count: null })),
    },
  };
};
```

Register in `migrations.ts`: `import { migrateV5ToV6 } from './v5ToV6.js';` and `[5, migrateV5ToV6]`.

In `schema/index.ts`: import `characterDocumentV5Schema` without its type, import
`characterDocumentV6Schema, type CharacterDocumentV6` from `./v6/index.js`, `CURRENT = 6`,
`6: characterDocumentV6Schema`, `CharacterDocument = CharacterDocumentV6`,
`CURRENT_SCHEMA = characterDocumentV6Schema`, `createCharacter` from `./v6/index.js`, and the
comment's `characterDocumentV5Schema, CharacterDocumentV5` → `V6`.

Compile fix in `src/business/equipment.ts` `addWeapon` (Task 3 replaces it):
`{ ...equipmentNode(init), attack: checked, count: null }`.

Extend the pinned chains: `codec.test.ts` and `indexedDbRepository.test.ts` import
`migrateV5ToV6` and wrap the existing `migrateV4ToV5(…)` call in `migrateV5ToV6(…)`.

- [ ] **Step 5: Run** `npm test`, `npm run typecheck` — fix any weapon literal typed as
  `CharacterDocument` that now lacks `count` by adding `count: null`. Prove the bait bites:
  make the migration set `count: 5` for a weapon whose description contains a digit; the bait
  test fails; restore.

- [ ] **Step 6: Commit** — `feat(schema): migrate v5 to v6 and make v6 current`

---

### Task 3: `WeaponBO` count

**Files:**
- Modify: `src/business/errors.ts`, `src/business/equipment.ts`, `src/business/equipment.test.ts`,
  `src/business/characterSheet.roundTrip.test.ts`

**Interfaces:**
- Consumes: `WeaponData` with `count: number | null` (Task 2)
- Produces: `WeaponBO.count: number | null`, `WeaponBO.stackable: boolean`,
  `WeaponBO.setStackable(value: boolean): void`, `WeaponBO.setCount(value: number): void`,
  `NewWeapon.count?: number | null`, `RuleCode` `'NOT_STACKABLE'`

- [ ] **Step 1: Failing tests** appended to `describe('WeaponBO')` in `equipment.test.ts`

```ts
  it('starts with no count: not stackable', () => {
    const javelin = sheetFor().equipment.addWeapon({ name: 'Javelin' });
    expect([javelin.count, javelin.stackable]).toEqual([null, false]);
  });

  it('creates the count at 0 when made stackable, and keeps a count it already has', () => {
    const sheet = sheetFor();
    const javelin = sheet.equipment.addWeapon({ name: 'Javelin' });
    javelin.setStackable(true);
    expect([javelin.count, javelin.stackable]).toEqual([0, true]);
    javelin.setCount(4);
    javelin.setStackable(true);
    expect(javelin.count).toBe(4);
    expect(sheet.toDocument().equipment.weapons[0]?.count).toBe(4);
  });

  it('clears the count when made not stackable', () => {
    const sheet = sheetFor();
    const javelin = sheet.equipment.addWeapon({ name: 'Javelin', count: 4 });
    javelin.setStackable(false);
    expect([javelin.count, javelin.stackable]).toEqual([null, false]);
    expect(sheet.toDocument().equipment.weapons[0]?.count).toBeNull();
  });

  // 0 is "none left", which is still a stack: only null is "not stackable".
  it('stays stackable at a count of 0', () => {
    const javelin = sheetFor().equipment.addWeapon({ name: 'Javelin', count: 1 });
    javelin.setCount(0);
    expect([javelin.count, javelin.stackable]).toEqual([0, true]);
  });

  it('refuses a count on a weapon that is not stackable (NOT_STACKABLE)', () => {
    const javelin = sheetFor().equipment.addWeapon({ name: 'Javelin' });
    expect(code(() => javelin.setCount(3))).toBe('NOT_STACKABLE');
    expect(javelin.count).toBeNull();
  });

  it.each([
    [-1, 'NEGATIVE'],
    [1.5, 'NOT_AN_INTEGER'],
  ])('reports a count of %j as %s, even on a weapon that is not stackable', (value, expected) => {
    const sheet = sheetFor();
    const stackable = sheet.equipment.addWeapon({ name: 'Javelin', count: 2 });
    const single = sheet.equipment.addWeapon({ name: 'Rapier' });
    expect(code(() => stackable.setCount(value))).toBe(expected);
    expect(code(() => single.setCount(value))).toBe(expected);
    expect(stackable.count).toBe(2);
  });

  it('adds a weapon with a count, last in the stored weapon', () => {
    const sheet = sheetFor();
    sheet.equipment.addWeapon({ name: 'Javelin', count: 5 });
    const stored = sheet.toDocument().equipment.weapons[0]!;
    expect(stored.count).toBe(5);
    expect(Object.keys(stored).at(-1)).toBe('count');
  });

  it('adds nothing when the new count is invalid', () => {
    const sheet = sheetFor();
    expect(code(() => sheet.equipment.addWeapon({ name: 'Javelin', count: -1 }))).toBe(
      'NEGATIVE',
    );
    expect(sheet.equipment.weapons).toEqual([]);
  });

  it('never gives other equipment a count key', () => {
    const sheet = sheetFor();
    sheet.equipment.addOther({ name: 'Cloak' });
    expect(sheet.toDocument().equipment.other[0]).not.toHaveProperty('count');
  });
```

In `characterSheet.roundTrip.test.ts` `fill()`, after the Rapier lines:

```ts
  sheet.equipment.addWeapon({ name: 'Javelin' }).setStackable(true);
  sheet.equipment.weapons[1]?.setCount(5);
```

- [ ] **Step 2: Run** `npx vitest run src/business/equipment.test.ts` — FAIL (`setStackable` is
  not a function, `count` undefined).

- [ ] **Step 3: Implement**

`errors.ts`: add `| 'NOT_STACKABLE'` after `'NO_ATTACK'`.

`equipment.ts`:

```ts
export interface NewWeapon extends NewEquipmentItem {
  /** Absent or `null`: no attack roll entered yet. */
  attack?: WeaponAttack | null;
  /** Absent or `null`: not stackable. */
  count?: number | null;
}
```

```ts
  addWeapon({ attack = null, count = null, ...init }: NewWeapon): WeaponBO {
    // Checked before anything is pushed, so a bad attack or count leaves no half-made weapon.
    const checkedAttack = attack === null ? null : weaponAttack(attack);
    const checkedCount = count === null ? null : nonNegativeInt(count);
    const node = pushAndRead(this.#weapons, {
      ...equipmentNode(init),
      attack: checkedAttack,
      count: checkedCount,
    });
    return new WeaponBO(node, this.#weapons);
  }
```

and in `WeaponBO` (with `nonNegativeInt` imported from `./guards.js`):

```ts
  /** `null` when the weapon is not stackable; 0 is a stackable weapon with none left. */
  get count(): number | null {
    return this.node.count;
  }

  /** Derived, never stored: a weapon is stackable exactly when it has a count. */
  get stackable(): boolean {
    return this.node.count !== null;
  }

  /**
   * On creates the count at 0 (spec §1); a weapon that already has one keeps it. Off clears it,
   * with no confirmation, as clearing the attack ability does.
   */
  setStackable(value: boolean): void {
    if (!value) this.node.count = null;
    else if (this.node.count === null) this.node.count = 0;
  }

  /** The value is checked first, so a bad number reads as that even when not stackable. */
  setCount(value: number): void {
    const count = nonNegativeInt(value);
    if (this.node.count === null) {
      throw new RuleViolation('NOT_STACKABLE', `make ${this.name} stackable first`);
    }
    this.node.count = count;
  }
```

- [ ] **Step 4: Run** `npm test`, `npm run typecheck`. Prove a test bites: make `setStackable(true)`
  always write 0; the "keeps a count" test alone fails; restore.

- [ ] **Step 5: Commit** — `feat(business): a weapon's count, created by making it stackable`

---

### Task 4: View and actions

**Files:**
- Modify: `src/ui/types.ts`, `src/ui/bind.ts`, `src/ui/bind.test.tsx`, `src/ui/fixtures.ts`

**Interfaces:**
- Consumes: Task 3's `WeaponBO` API
- Produces: `WeaponView.count: number | null`;
  `EquipmentActions.addWeapon(item: NewEquipmentItem & { attack: WeaponAttackView | null; count: number | null })`;
  `EquipmentActions.setWeaponStackable(id: string, stackable: boolean): void`;
  `EquipmentActions.setWeaponCount(id: string, count: number): void`

- [ ] **Step 1: Failing tests** in `bind.test.tsx`
  - the view test: add `count: 3` to the seeded Rapier (`addWeapon({ …, count: 3 })`) and
    `count: 3` to the expected weapon view.
  - the add-everything actions test: pass `count: 2` to `addWeapon`; expect `count: 2` in
    `toMatchObject` of the stored weapon.
  - every other `actions.equipment.addWeapon({…})` gets `count: null`.
  - the by-id setter test: after the attack setters,
    `actions.equipment.setWeaponStackable(gearId, true); actions.equipment.setWeaponCount(gearId, 9);`
    and expect the stored weapon `toMatchObject({ count: 9 })` (9 is distinct from every other
    number in that test).
  - a new test:

```ts
  it('makes a weapon stackable and not, through its actions', () => {
    const sheet = newSheet();
    const actions = toSheetActions(sheet);
    actions.equipment.addWeapon({
      name: 'Javelin',
      description: '',
      attuned: false,
      equipped: false,
      attack: null,
      count: null,
    });
    const id = toSheetData(sheet).equipment.weapons[0]?.id ?? '';

    actions.equipment.setWeaponStackable(id, true);
    expect(toSheetData(sheet).equipment.weapons[0]?.count).toBe(0);
    actions.equipment.setWeaponCount(id, 6);
    expect(toSheetData(sheet).equipment.weapons[0]?.count).toBe(6);
    actions.equipment.setWeaponStackable(id, false);
    expect(sheet.toDocument().equipment.weapons[0]?.count).toBeNull();
  });
```

- [ ] **Step 2: Run** `npx vitest run src/ui/bind.test.tsx` — FAIL.

- [ ] **Step 3: Implement**

`types.ts`:

```ts
export interface WeaponView extends EquipmentItemView {
  /** `null` when no attack roll has been entered. */
  attack: WeaponAttackView | null;
  /** `null` when the weapon is not stackable; 0 is a stack with none left. */
  count: number | null;
}
```

```ts
  addWeapon(
    item: NewEquipmentItem & { attack: WeaponAttackView | null; count: number | null },
  ): void;
  …
  /** On creates the count at 0, or keeps it; off clears it. */
  setWeaponStackable(id: string, stackable: boolean): void;
  setWeaponCount(id: string, count: number): void;
```

`bind.ts`: `weaponView` adds `count: item.count`; `equipmentActions` adds
`setWeaponStackable: (id, stackable) => weapon(id).setStackable(stackable)` and
`setWeaponCount: (id, count) => weapon(id).setCount(count)`.

`fixtures.ts`: every weapon view gets `count` (Rapier `null`, Shortbow `null`, Dagger
`count: 2` and renamed from `Dagger (x2)` to `Dagger`); `noEquipmentActions` gets
`setWeaponStackable: () => {}` and `setWeaponCount: () => {}`.

- [ ] **Step 4: Run** `npm test`, `npm run typecheck` (the screen still compiles: it ignores
  `count` for now except `addWeapon`, which must pass `count: null` — do that in
  `NewEquipmentDialog.create` until Task 5).

- [ ] **Step 5: Commit** — `feat(ui): bind a weapon's count and stackable actions`

---

### Task 5: The Equipment screen

**Files:**
- Modify: `src/ui/screens/Equipment.tsx`, `src/ui/screens/Equipment.test.tsx`, `src/ui/styles.css`

**Interfaces:**
- Consumes: Task 4's view and actions

- [ ] **Step 1: Failing tests** in `Equipment.test.tsx`

```ts
describe('weapon count', () => {
  it('shows on a stackable weapon only, before the attack badge, and edits from the row', () => {
    const actions = spyActions(noEquipmentActions);
    renderWith(actions);
    const dagger = rowOf('Dagger');
    const count = within(dagger).getByLabelText('Dagger count') as HTMLInputElement;
    expect(count.value).toBe('2');
    // Count, then the attack badge: the badge stays at the far right.
    const after = [...dagger.children].slice(1);
    expect(after.map((element) => element.className)).toEqual(['num qty', 'atk']);
    expect(within(rowOf('Rapier')).queryByLabelText('Rapier count')).toBeNull();

    fireEvent.change(count, { target: { value: '1' } });
    expect(actions.setWeaponCount).toHaveBeenCalledWith('e3', 1);
  });

  it('opens the edit dialog with Stackable ticked and the count beside it', () => {
    renderWith(noEquipmentActions);
    open('Dagger');
    expect((screen.getByLabelText('Stackable') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Count') as HTMLInputElement).value).toBe('2');
  });

  it('ticks and unticks Stackable through its action, with no confirmation', () => {
    const actions = spyActions(noEquipmentActions);
    renderWith(actions);
    open('Rapier');
    expect((screen.getByLabelText('Stackable') as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByLabelText('Count')).toBeNull();
    fireEvent.click(screen.getByLabelText('Stackable'));
    expect(actions.setWeaponStackable).toHaveBeenCalledWith('e1', true);
  });

  it('edits the count from the dialog', () => {
    const actions = spyActions(noEquipmentActions);
    renderWith(actions);
    open('Dagger');
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '7' } });
    expect(actions.setWeaponCount).toHaveBeenCalledWith('e3', 7);
    fireEvent.click(screen.getByLabelText('Stackable'));
    expect(actions.setWeaponStackable).toHaveBeenCalledWith('e3', false);
  });

  it('sits directly under the name in the dialog', () => {
    renderWith(noEquipmentActions);
    open('Rapier');
    const stack = screen.getByLabelText('Stackable').closest('.stackrow')!;
    expect(stack.previousElementSibling?.querySelector('input')?.getAttribute('aria-label')).toBe(
      'Name',
    );
  });

  it('creates a stackable weapon starting at 0, and a plain one with a null count', () => {
    const actions = spyActions(noEquipmentActions);
    renderWith(actions);
    fireEvent.click(screen.getByRole('button', { name: 'Add entry to Weapons' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Javelin' } });
    fireEvent.click(screen.getByLabelText('Stackable'));
    expect((screen.getByLabelText('Count') as HTMLInputElement).value).toBe('0');
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(actions.addWeapon).toHaveBeenCalledWith(expect.objectContaining({ count: 5 }));
  });

  it('forgets the count when Stackable is unticked before Create', () => {
    const actions = spyActions(noEquipmentActions);
    renderWith(actions);
    fireEvent.click(screen.getByRole('button', { name: 'Add entry to Weapons' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Javelin' } });
    fireEvent.click(screen.getByLabelText('Stackable'));
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '5' } });
    fireEvent.click(screen.getByLabelText('Stackable'));
    expect(screen.queryByLabelText('Count')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(actions.addWeapon).toHaveBeenCalledWith(expect.objectContaining({ count: null }));
  });

  it('is only for weapons', () => {
    renderWith(noEquipmentActions);
    open('Studded Leather');
    expect(screen.queryByLabelText('Stackable')).toBeNull();
  });
});
```

The existing "create a weapon with its attack" test gains `count: null` in its expected call.

- [ ] **Step 2: Run** `npx vitest run src/ui/screens/Equipment.test.tsx` — FAIL.

- [ ] **Step 3: Implement** in `Equipment.tsx`

A shared component beside `AttackFields`:

```tsx
/**
 * Stackable and, while it is ticked, the count — directly under the name in both weapon dialogs
 * (stackable weapons spec §5). Stackable is not stored: it is `count !== null`.
 */
function StackFields({
  count,
  onStackable,
  onCount,
}: {
  count: number | null;
  onStackable(stackable: boolean): void;
  onCount(count: number): void;
}) {
  return (
    <div className="stackrow">
      <CheckRow label="Stackable" checked={count !== null} onChange={onStackable} />
      {count !== null && (
        <span className="stackcount">
          <span className="dlabel" aria-hidden="true">
            Count
          </span>
          <NumberField label="Count" className="inp stat" value={count} onChange={onCount} />
        </span>
      )}
    </div>
  );
}
```

Row (`row`): `after` becomes

```tsx
        after={
          (count !== null || attack !== null) && (
            <>
              {count !== null && (
                // Editable on the row, as an inventory item's count is: it is what changes when
                // a javelin is thrown, and a dialog per throw is friction per use.
                <NumberField
                  label={`${item.name} count`}
                  className="num qty"
                  value={count}
                  onChange={(value) => actions.setWeaponCount(item.id, value)}
                />
              )}
              {attack !== null && (…the existing .atk span…)}
            </>
          )
        }
```

with `const count = isWeapon(item) ? item.count : null;` beside `attack`.

`NewEquipmentDialog`: `const [count, setCount] = useState<number | null>(null);`, after the name
`<input>`: `{weapon && <StackFields count={count} onStackable={(on) => setCount(on ? 0 : null)} onCount={setCount} />}`,
and `addWeapon({ …item, attack: …, count })`.

`EditEquipmentDialog`: after the `NameField`:
`{weapon && <StackFields count={weapon.count} onStackable={(on) => actions.setWeaponStackable(weapon.id, on)} onCount={(value) => actions.setWeaponCount(weapon.id, value)} />}`.

`styles.css`, after `.chkpair`:

```css
/* Stackable, and its count beside it while ticked, under a weapon's name. The row keeps the
   field's height either way, so ticking does not push the dialog down. */
.stackrow {
  display: flex;
  align-items: center;
  gap: 18px;
  min-height: 40px;
  margin-top: 12px;
}
.stackrow .chkrow {
  margin-top: 0;
}
.stackcount {
  display: flex;
  align-items: center;
  gap: 8px;
}
.stackcount .dlabel {
  margin: 0;
}
.stackcount .inp {
  width: 72px;
}
```

- [ ] **Step 4: Run** `npm test`, `npm run typecheck`, `npm run lint`. Prove the order test
  bites: swap the two in `after`; that test alone fails; restore.

- [ ] **Step 5: Commit** — `feat(ui): stackable weapons — a count on the row and in the dialogs`

---

### Task 6: Seed, docs, and the browser

**Files:**
- Modify: `src/devSeed.ts`, `AGENTS.md`, `docs/superpowers/specs/2026-10-20-stackable-weapons-design.md`

- [ ] **Step 1: Dev seed.** `Dagger (x2)` → `Dagger` with `count: 2` in `src/devSeed.ts`.
- [ ] **Step 2: AGENTS.md.** A "Schema v6: stackable weapons" entry after v5 (what v6 adds, the
  migration and its bait, the UI, what was verified); `v6/` in the isolation paragraph; the map
  (`v5/` frozen, `v6/` current, `v5ToV6.ts`, `v5DocFor`); the test count.
- [ ] **Step 3: Browser.** `npm run dev`, Chromium via Playwright at 320px and 360px, light and
  dark: tick Stackable, set 5, reload, count survives; change it from the row; untick and it
  goes; put a v5 document into IndexedDB, list, and read it back as v6 with `count: null`; no
  sideways scroll at 320px.
- [ ] **Step 4: Spec status** → built, with any deviations in a §8.
- [ ] **Step 5: Run everything, commit** — `docs: record schema v6 and stackable weapons`, push.
