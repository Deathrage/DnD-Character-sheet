# Stackable weapons — Design

A weapon the player carries several of — javelins, daggers, darts, throwing hammers — gets a
count, kept on the weapon row the way an inventory item keeps its count. The player ticks
**Stackable** in the weapon's dialog, which brings up a **Count** field starting at 0. The app
computes none of it (AGENTS.md, "What this is"): throwing a javelin decrements nothing, and a
description such as "5 javelins" is never read. Needs character schema v6.

Status: **built 2026-10-20** on branch `ccr-42a01b68-ir3yil`, from `docs/superpowers/plans/2026-10-20-stackable-weapons.md`.

## 1. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Stored as | **`count: number \| null`** on every weapon, a required key. Nothing stores "stackable" | User's decision. Stackable is `count !== null`, so the two can never disagree. The same shape as `attack: … \| null` |
| Count 0 | **Still stackable** | "No javelins left" is a real state, and it is not "this weapon is not counted" |
| Which items | **Weapons only.** Other equipment is unchanged | What was asked for. Ammunition and other stacks already live in Inventory |
| Ticking Stackable | Creates the count at **0**; a weapon that already has a count keeps it | User's decision |
| Unticking Stackable | **Clears the count at once**, no confirmation | User's choice. As the pact-slots switches and an attack ability of None do |
| Row layout | Name, then the **count field**, then the **attack badge** at the far right | User's choice. The badge never moves; the count appears beside the name only on stackable weapons |
| Where the count is edited | **On the row**, as in Inventory, and in the dialog | "The count will appear same as in inventory items". A dialog per thrown javelin is friction per use |
| Dialog placement | **Directly under Name**: a Stackable checkbox, with Count beside it while ticked | User's choice |
| Existing characters | Migrate with **no count**: `count: null` on every weapon | The app writes nothing the player did not do. A description's "5 javelins" is a note |

## 2. Schema v6

v5 is frozen: it is on `main` and deployed. `v6/` starts as a literal copy of `v5/` and diverges
only as listed here.

```ts
schemaVersion: 6

equipment.weapons[]: {
  id, name, description, attuned, equipped, attack,   // as in v5
  count: integer ≥ 0 | null,                           // NEW, required key, last
}
```

- **Required.** `null` is "not stackable"; a missing key is rejected, as a missing `attack` is.
- **`nonNegativeInt.nullable()`**, the inventory item's rule plus `null`. No upper limit, as the
  inventory count has none.
- **Weapons only.** `equipment.other[]` is the v5 item, unchanged.
- **Blank document**: unchanged apart from `schemaVersion: 6` — it has no weapons.

## 3. Migration v5 → v6

`migrateV5ToV6` sets `schemaVersion: 6` and gives every weapon `count: null`, last in the weapon,
where the business layer puts it on a new one. It reads nothing else: not the weapon's name, not
its description, not an inventory item of the same name. Frozen once released, like every
migration.

Registered in `schema/index.ts` (`CURRENT = 6`) and `migration/migrations.ts`, the only two files
outside the version directories that a bump touches.

## 4. Business layer

`src/business/equipment.ts`, on `WeaponBO`:

```ts
/** `null` when the weapon is not stackable. 0 is a stackable weapon with none left. */
get count(): number | null

/** Derived, never stored: a weapon is stackable exactly when it has a count. */
get stackable(): boolean

/** On creates the count at 0, or keeps the one there is; off clears it. */
setStackable(value: boolean): void

/** The value is checked first, then that the weapon is stackable at all. */
setCount(value: number): void
```

- **`setCount`** checks the number with `nonNegativeInt` (`NEGATIVE`, `NOT_AN_INTEGER`) and then
  throws **`NOT_STACKABLE`** on a weapon whose count is `null`, as `setAttackBonus` throws
  `NO_ATTACK`. One new `RuleCode`.
- **`NewWeapon.count?: number | null`**, absent meaning `null`. A number is checked before
  anything is pushed, so a bad count leaves no half-made weapon behind, as a bad attack does.
- **`WeaponData`** follows the document type; nothing new is exported from `index.ts`.

## 5. UI

### Row

```
Javelin               [ 4 ]  DEX +5
1d6+3 piercing · Thrown (30/120)

Longsword                    STR +6
1d8+4 slashing · Versatile
```

- The count is the inventory's editable `NumberField` (`num qty`), labelled `"<name> count"`.
- It shows only when `count !== null`, wherever the weapon's row is drawn: Weapons, and the
  Attuned and Equipped lists.

### Dialogs

```
Name
[ Javelin                    ]
☑ Stackable   Count [ 4 ]

Attack ability
[STR][DEX][CON][INT][WIS][CHA][None]
…
```

- **Both weapon dialogs**, new and edit. Not the other-equipment dialogs.
- The row is the existing `CheckRow` labelled **Stackable**; while ticked, a **Count**
  `NumberField` sits beside it.
- **New weapon**: dialog state `count: number | null`, starting `null`. Ticking sets 0,
  unticking sets `null`, and Create passes it to `addWeapon`.
- **Edit weapon**: ticking and unticking call `setWeaponStackable`; the field calls
  `setWeaponCount`.

### View and actions

- **`WeaponView.count: number | null`**.
- **`EquipmentActions`** gains `setWeaponStackable(id, stackable)` and `setWeaponCount(id,
  count)`; `addWeapon` takes `count: number | null`.

### Hub summary

Unchanged.

## 6. Testing

Every new test is broken on purpose once to prove it bites (AGENTS.md, "Traps").

**Schema `v6/`:**
- the v5 tests, copied
- the weapon's strict-table row covers `count`
- `count`: `null`, 0 and 12 accepted; −1, 1.5, a string and a missing key rejected
- other equipment still rejects a `count` key

**Migration:**
- `v5ToV6.test.ts`, against a new `v5DocFor` fixture, checked against `SCHEMAS[5]` in
  `fixtures.test.ts`
- the fixture has a weapon "Javelins" described as "5 javelins" and an inventory item "Javelins"
  with count 5, so a migration that read either would be caught
- the real-registry test (`indexedDbRepository.test.ts`) and `codec.test.ts` extended to v6

**Business:**
- `count`, `stackable`, `setStackable` (on from null, on keeping a count, off), `setCount`
- `NOT_STACKABLE`, and the number guards before it
- `addWeapon` with and without a count, and a bad count leaving nothing behind
- the round-trip test fills a weapon count and still satisfies `CURRENT_SCHEMA`

**UI:**
- `Equipment.test.tsx`: the row's count only on a stackable weapon and before the attack badge;
  editing it from the row; the Stackable checkbox in both dialogs, its Count field, and Create
  passing the count
- `bind.test.tsx`: the view's `count` and the two new actions
- the Equipment story and `src/ui/fixtures.ts` get a stackable weapon; the dev seed gets Javelins

**In the browser** (Chromium at 320px and 360px, light and dark):
- tick Stackable, set 5, reload, and the count survives; change it from the row
- untick Stackable and the field goes
- a stored v5 document lists undamaged and is written back as v6 with `count: null`
- at 320px a stackable weapon with an attack keeps its name readable and nothing scrolls sideways

## 7. Out of scope

A count on other equipment, decrementing on an attack, and linking a weapon's count to an
inventory item.

## 8. Deviations

The build matches this design except for one detail of §4 and one of §6.

- **`WeaponBO` has no `stackable` getter.** §4 listed one. It was built, then removed in the
  cleanup pass, because only tests read it: the UI asks `count !== null` itself, and the attack
  has no `hasAttack` getter either. One definition of "stackable" is the count, with no second
  one to disagree with it.

- **The dev seed's stackable weapon is a Dagger, not Javelins.** The seed already had a weapon
  named `Dagger (x2)`: a count written into the name because there was nowhere else to put it.
  It is now `Dagger` with a count of 2, which shows the feature doing the job that name was
  doing, without adding a fourth weapon to Sable. The story fixtures in `src/ui/fixtures.ts` do
  the same.
