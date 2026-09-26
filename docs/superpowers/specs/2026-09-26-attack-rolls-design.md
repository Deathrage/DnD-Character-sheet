# Attack rolls and spellcasting — Design

Lets a player record a weapon's attack roll (ability, bonus, damage) and, for each ability they
cast with, a spell attack bonus and spell save DC. Every number is typed by the player; the app
computes none of them (AGENTS.md, "What this is"). Needs character schema v2.

Status: **draft, awaiting validation.** Nothing here is built.

## 1. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Computed or entered | **Entered.** Nothing is derived from ability modifiers, proficiency bonus, class or level | The app computes nothing, so it never disagrees with a house rule, a magic item or a feature |
| Ability first | **Nothing numeric exists without an ability.** A weapon's bonus and damage, and a spellcasting entry's attack bonus and DC, can only be set once an ability is chosen. Clearing the ability clears them | User's decision. The ability says what the numbers belong to, so a number with no ability has no meaning |
| Weapon attack abilities | **All six**, STR to CHA | User's decision. Pact of the Blade (CHA), Shillelagh (WIS), Battle Smith (INT) and homebrew are real. The app does not rule on which ability is allowed |
| Weapon damage | **Free text**, e.g. `1d8+4 slashing`, part of the attack | User's decision. Damage is dice plus a type, not one number |
| Spellcasting | **One entry per ability**, keyed by it: attack bonus and save DC | User's decision ("for each spellcasting ability"). The key is the identity, like a hit die's size, so two Intelligence entries cannot exist. A Cleric/Wizard has a WIS entry and an INT entry |
| Where it shows | Spellcasting at the top of **Spell List**; the attack on each **weapon row** | User's decision |
| Other equipment | **No attack.** Only `equipment.weapons` items have one | Weapons are the list that holds weapons. An item that makes an attack roll belongs in Weapons |
| Existing characters | Migrate with **no attacks and no spellcasting** | A v1 document said nothing about either. `+0` would claim it did, and parsing "+7 to hit" out of a description would be a silent rewrite |

## 2. Schema v2

v1 is frozen: it has shipped and real documents exist (src/data/schema/README.md). `v2/` starts
as a literal copy of `v1/` and diverges only as listed here. Everything not listed is unchanged.

```ts
schemaVersion: 2

equipment: {
  weapons: {
    id, name, description, attuned, equipped,         // as in v1
    attack: {                                         // NEW, required key, nullable
      ability: 'strength' | 'dexterity' | 'constitution'
             | 'intelligence' | 'wisdom' | 'charisma',
      bonus: integer,                                 // signed
      damage: string,                                 // 0–80 chars, no leading/trailing space
    } | null,
  }[],
  other: { id, name, description, attuned, equipped }[],   // unchanged: no `attack` key
}

spellList: {
  categories, uncategorized,                          // as in v1
  spellcasting: {                                     // NEW, required key
    [ability]?: { attackBonus: integer /* signed */, saveDc: integer /* ≥ 0 */ },
  },
}
```

- **`attack` is one object** because nothing in it exists without the ability (§1). `null` means
  no attack roll entered. The key is required: "no attack" is `null`, never a missing key.
- **`damage` may be empty** (`''`), meaning no damage entered yet. It is not a short name: a
  name must be non-empty. It rejects padding rather than trimming, like every name, and the
  business layer trims on write.
- **`spellcasting` is a partial record** over the six ability keys: `z.partialRecord`, checked
  against zod 4.4.3. It rejects a key that is not an ability and allows any subset, including
  none (`{}`). An absent key means "does not cast with this ability".
- **The ability enum is built from `ABILITY_KEYS`**, the tuple that already keys `abilities`, so
  the two cannot name different sets.
- `weaponAttack`, `weaponItem` and `spellcastingEntry` are each `.strict()` and each get a row in
  the unknown-key table. Weapons and other equipment are now separate schema instances, so each
  gets its own row.
- `signedInt`'s comment in `v2/primitives.ts` ("the only signed fields are the three
  modifiers") becomes untrue and is updated there. v1's copy stays as it is.
- The document-wide duplicate-id check does not change. `spellcasting` has no ids.

## 3. Migration 1 → 2

`src/data/migration/v1ToV2.ts`, registered as `MIGRATIONS.set(1, migrateV1ToV2)`:

- `schemaVersion: 2`
- every `equipment.weapons[i]` gets `attack: null`; `equipment.other` is untouched
- `spellList` gets `spellcasting: {}`

It is pure and builds new objects rather than editing its input. It reads no descriptions. It
cannot import `v1/` (lint forbids it), so it restates the few v1 fields it touches structurally;
the walk has already validated the input at v1.

`schema/index.ts`: `CURRENT = 2`, `SCHEMAS = { 1, 2 }`, and `CharacterDocument`,
`CURRENT_SCHEMA` and `createCharacter` point at v2.

What follows from the existing machinery, with no new code:

- A stored v1 character migrates the first time it is listed or opened, and `get()`/`list()`
  write it back at v2 (AGENTS.md, "A document that loaded by migrating is written back").
- An imported v1 file and a restored v1 cloud version migrate the same way.
- **An older build that meets a v2 document reports `FROM_FUTURE`** and keeps the raw JSON. That
  happens when a player exports from the new build and imports into an installed PWA that has
  not updated, or restores a v2 cloud version on an old build (the cloud screen already flags
  `fromNewerApp`). The update prompt resolves both. Accepted: it is what the versioning is for.

## 4. Business layer

### 4.1 Weapons

`EquipmentBO.weapons` returns `WeaponBO[]`. `WeaponBO extends EquipmentItemBO<WeaponData>`, which
becomes generic over its node; `other` stays `EquipmentItemBO`.

```ts
class WeaponBO {
  get attack(): { ability: AbilityKey; bonus: number; damage: string } | null  // a copy

  setAttackAbility(ability: AbilityKey | null): void
  setAttackBonus(bonus: number): void    // NO_ATTACK when attack is null
  setAttackDamage(damage: string): void  // NO_ATTACK when attack is null; trimmed, TOO_LONG > 80
}
```

- **Choosing the first ability** creates `{ ability, bonus: 0, damage: '' }`. The `0` is a
  starting value the player is about to overwrite, not a claim.
- **Changing the ability keeps bonus and damage.** Picking STR then fixing it to DEX must not
  wipe the number typed in between.
- **`null` clears the whole attack**, bonus and damage included.
- `addWeapon({ …, attack? })` accepts an optional complete attack, validated before anything is
  pushed, so a bad one leaves no half-made weapon.
- `attuned` and `equipped` stay derived over both lists, as today.

### 4.2 Spellcasting

`SpellListBO` stops being a type alias and becomes a class extending `CategorizedBO`, the way
`CountersBO` adds spell slots, with one extra member, `spellcasting: SpellcastingBO`.

```ts
class SpellcastingBO {
  get items(): SpellcastingEntryBO[]                       // STR→CHA order, present ones only
  add(ability: AbilityKey, init: { attackBonus: number; saveDc: number }): SpellcastingEntryBO
                                                           // DUPLICATE_SPELLCASTING if present
}

class SpellcastingEntryBO {
  get ability(): AbilityKey
  get attackBonus(): number;  setAttackBonus(value: number): void   // integer
  get saveDc(): number;       setSaveDc(value: number): void        // non-negative integer
  remove(): void                                                    // GONE if already removed
}
```

- **Keyed, not held by reference**, exactly like `HitDieBO`: the record key is the identity, so
  the business object re-reads `spellcasting[ability]` on every access and reports `GONE` when
  the key is absent.
- **`add` takes the numbers with the ability**, so an entry never exists before the player has
  seen its fields (the dialog in §5.1 collects all three).

### 4.3 Guards and rule codes

- `ABILITY_KEYS` is duplicated into `guards.ts`, with the same comment `SPELL_SLOT_LEVELS` has in
  `counters.ts`: `src/business/` may not import a version directory. It is typed
  `satisfies readonly AbilityKey[]`, and a test checks it against a blank document's
  `abilities` keys, so a missing ability fails a test rather than passing silently.
- `abilityKey(value)` throws `UNKNOWN_ABILITY`. The type already restricts callers; this catches
  plain JavaScript or a cast, because an unknown key would make the document unsaveable.
- New `RuleCode`s, each true of every value it rejects:
  - `UNKNOWN_ABILITY`: a string that is not one of the six abilities
  - `DUPLICATE_SPELLCASTING`: that ability already has an entry
  - `NO_ATTACK`: a bonus or damage write on a weapon with no ability chosen
- `TOO_LONG` covers damage over 80 characters, as for names.
- `bind.ts` adds `DUPLICATE_SPELLCASTING` to `PRESENTABLE`, and `TOO_LONG` is already there.
  `NO_ATTACK` and `UNKNOWN_ABILITY` stay loud: the UI never offers either.

### 4.4 Exports

`src/business/index.ts` adds `WeaponBO`, `WeaponAttack`, `NewWeapon`, `SpellListBO` (now a
class), `SpellcastingBO` and `SpellcastingEntryBO`. It still exports no `*Data` alias.

## 5. UI

### 5.1 Spell List

A **Spellcasting** block above the categories, in the slot `CategorizedSection` already gives
Counters for its spell slots:

```
Spellcasting                              [+ Add]
  INT   Spell attack +7   Save DC 15
  WIS   Spell attack +5   Save DC 13
```

- **Add** opens a dialog. It shows an ability select listing only the unused abilities, and the
  attack bonus and save DC fields appear once an ability is picked. **Create** writes all three
  in one `add`. The button is hidden when all six are used.
- **Tapping a row** opens an edit dialog with the two numbers and **Delete**. The ability is not
  editable here, because it is the entry's identity: to change it, delete the entry and add another.
- With no entries the block shows "No spellcasting ability — tap Add." It is always visible,
  like Counters' spell slots, so the way in is never hidden.

### 5.2 Weapons

In the **new weapon** and **edit weapon** dialogs, beneath the description:

- **Attack ability**: a select with *None* and STR, DEX, CON, INT, WIS, CHA.
- **Attack bonus** (a signed `NumberField`) and **Damage** (a text input) appear only when an
  ability is chosen.
- In the edit dialog, choosing *None* clears the attack at once, with a hint beside the
  select: "Choosing None clears the bonus and damage." It needs no confirmation: re-entering one
  number and a short string is cheap.
- Other-equipment dialogs are unchanged.

A weapon row shows the attack after the name when one exists:

```
Rapier                                  DEX +7 · 1d8+4 piercing
Improvised club
```

The damage part is omitted when it is empty. The attack also shows on the row when the weapon
appears in the derived Attuned and Equipped blocks.

### 5.3 Types and binding

- `WeaponView extends EquipmentItemView` adds `attack: { ability; bonus; damage } | null`.
  `EquipmentView.weapons` is `WeaponView[]`. `attuned` and `equipped` hold both kinds, and a row
  checks `'attack' in item`.
- `EquipmentActions` adds `setWeaponAttackAbility(id, ability | null)`,
  `setWeaponAttackBonus(id, n)` and `setWeaponAttackDamage(id, text): NameResult`. Damage is
  rejectable because of `TOO_LONG`. `addEquipment`'s item gains an optional `attack`.
- `SpellListView` becomes `CategorizedView<SpellView> & { spellcasting: SpellcastingView[] }`,
  with `SpellcastingView = { ability; attackBonus; saveDc }`, in STR→CHA order.
- `SpellListActions` adds `addSpellcasting(ability, { attackBonus, saveDc }): NameResult`,
  `setSpellAttackBonus(ability, n)`, `setSpellSaveDc(ability, n)` and
  `removeSpellcasting(ability)`.
- Ability labels come from `reference.ts`'s existing `ABILITIES` (`short: 'STR'` …).

## 6. Testing

Every new test is proven to bite: break what it guards, watch it (and only it) fail, restore.

- **`v2/` schema.** The copied v1 suite, retargeted at v2, plus:
  - `attack` required on weapons, and nullable
  - all six abilities accepted and nothing else
  - bonus signed and integer
  - damage empty accepted, padded rejected, 81 characters rejected
  - no `attack` key allowed on other equipment
  - `spellcasting` required, `{}` accepted, a non-ability key rejected, a negative DC rejected,
    a negative attack bonus accepted
  - new unknown-key rows: weapon attack, spellcasting record, spellcasting entry, spell-list
    section, other-equipment item
- **`blank.ts`.** The document starts with `spellcasting: {}`. Add a no-shared-substructure row
  for `spellList.spellcasting`.
- **Migration.** A populated v1 document becomes exactly the expected v2 document. The input is
  not mutated. `other` items gain no key. A weapon whose description says "+7 to hit" still
  migrates to `attack: null`. `parseCharacter` on a v1 document returns a valid v2 document.
- **Repository.** A stored v1 document is written back at v2 after `list()`. This is the
  existing test's shape, run against the real registry.
- **Business.** For weapons:
  - the first ability creates an attack with bonus 0 and damage ''
  - changing the ability keeps bonus and damage
  - `null` clears the whole attack
  - `NO_ATTACK` on a bonus or damage write with no attack
  - `UNKNOWN_ABILITY` on a cast
  - damage trimmed and capped
  - `attack` returns a copy, so mutating it does not reach the document

  For spellcasting:
  - STR→CHA order
  - `DUPLICATE_SPELLCASTING`
  - `GONE` after `remove`
  - `ABILITY_KEYS` matches the blank document's abilities

  `characterSheet.roundTrip.test.ts` fills the new branches and still satisfies
  `CURRENT_SCHEMA`, and still finds no accessor that exposes the document.
- **UI.**
  - `bind.test.tsx` covers each new action.
  - `Equipment.test.tsx` covers the attack fields appearing only after an ability is chosen,
    *None* clearing them, and the row text.
  - A new `SpellList.test.tsx` covers adding (only unused abilities offered, Add hidden at six),
    editing, and deleting.
  - Stories and fixtures are updated.
- Test, typecheck, lint and `prettier --check` stay green.

## 7. Delivery order

Small commits, tests first, each one green:

1. `v2/` copy and its changes, with schema tests
2. migration, the `CURRENT` bump and fixtures, with migration and repository tests
3. `WeaponBO`, with its tests
4. `SpellcastingBO` and `SpellListBO`, with their tests
5. types, binding and the Equipment UI
6. the Spell List UI
7. AGENTS.md "Current state" and the test counts; `docs/BACKLOG.md` if anything is deferred

## 8. Open items

- **Multiclass with one shared ability.** A Wizard/Artificer casts with INT for both classes, so
  one entry covers both, which the D&D rules also give them. If a magic item ever makes two INT
  bonuses differ, the player records the one they use; there is no per-class split.
- **Ordering.** Spellcasting is shown STR→CHA, not in the order added. Say if you want the
  order added instead.
