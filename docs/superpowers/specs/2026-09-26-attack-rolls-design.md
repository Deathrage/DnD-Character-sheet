# Attack rolls and spellcasting — Design

Lets a player record a weapon's attack roll (ability, attack bonus, damage) and, for each ability
they cast with, a spell attack bonus and spell save DC. Every number is typed by the player; the
app computes none of them (AGENTS.md, "What this is"). Needs character schema v2.

Status: **validated; UI layout approved 2026-09-26.** Nothing here is built. Revised after checking
it against the code, and again when the UI was laid out (§9).

## 1. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Computed or entered | **Entered.** Nothing is derived from ability modifiers, proficiency bonus, class or level | The app computes nothing, so it never disagrees with a house rule, a magic item or a feature |
| Ability first | **Nothing numeric exists without an ability.** A weapon's attack bonus and damage, and a spellcasting entry's attack bonus and DC, can only be set once an ability is chosen. Clearing a weapon's ability clears its attack bonus and damage | User's decision. The ability says what the numbers belong to, so a number with no ability has no meaning |
| Ability keys | **Full names**, `strength` … `charisma`, the keys `abilitiesAndSkills.abilities` already uses. `STR` … `CHA` are display labels only, from `reference.ts` | User's decision. One spelling per ability in the document, so an attack's ability names the same key as the ability it belongs to, with no translation table |
| Field names | **`attackBonus`** for both the weapon's number and the spell attack number | User's decision. One idea, one name, easy to search for in code and raw JSON. The `attack.attackBonus` stutter is accepted |
| Weapon attack abilities | **All six** | User's decision. Pact of the Blade (CHA), Shillelagh (WIS), Battle Smith (INT) and homebrew are real. The app does not rule on which ability is allowed |
| Weapon damage | **Free text**, e.g. `1d8+4 slashing`, part of the attack | User's decision. Damage is dice plus a type, not one number |
| Spellcasting | **One entry per ability**, keyed by it: attack bonus and save DC | User's decision ("for each spellcasting ability"). The key is the identity, like a hit die's size, so two Intelligence entries cannot exist. A Cleric/Wizard has a WIS entry and an INT entry |
| Where it shows | Spellcasting at the top of **Spell List**; the attack on each **weapon row** | User's decision |
| Other equipment | **No attack.** Only `equipment.weapons` items have one | Weapons are the list that holds weapons. An item that makes an attack roll belongs in Weapons |
| Existing characters | Migrate with **no attacks and no spellcasting** | The app writes nothing the player did not do: a v1 weapon gets no `+0` it was never given, and "Damage: 1d8 Slashing" in a description is not parsed out of it |
| Starting values | Choosing a weapon's ability starts its attack bonus at **0** and damage **empty**; the row reads `DEX +0` until the player changes it | Accepted. Unlike a migrated weapon, the player chose the ability and sees the 0 in the field beside it. The alternative, an attack bonus that can be "not entered", needs a clearable number field the app does not have |

## 2. Schema v2

v1 is frozen: it has shipped, and real documents exist. `testAssets/zahir-ibn-talaar-2026-09-24.json`
is one, exported from the live app. `v2/` starts as a literal copy of `v1/` and diverges only as
listed here. Everything not listed is unchanged.

```ts
schemaVersion: 2

equipment: {
  weapons: {
    id, name, description, attuned, equipped,         // as in v1
    attack: {                                         // NEW, required key, nullable
      ability: 'strength' | 'dexterity' | 'constitution'
             | 'intelligence' | 'wisdom' | 'charisma',
      attackBonus: integer,                           // signed
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
  business layer trims on write. The limit is 80, the same as a short name.
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

`src/data/migration/v1ToV2.ts`, registered as `MIGRATIONS.set(1, migrateV1ToV2)`, where
`migrations.ts` already says it will go:

- `schemaVersion: 2`
- every `equipment.weapons[i]` gets `attack: null`; `equipment.other` is untouched
- `spellList` gets `spellcasting: {}`

It is pure and builds new objects rather than editing its input. It reads no descriptions. It
cannot import `v1/` (lint forbids it), so it restates the few v1 fields it touches structurally;
the walk has already validated the input at v1.

**A migration is frozen once released, like the schema it produces.** Cloud versions are never
rewritten, so a v1 backup goes through this function on every restore, for as long as the app
exists. Changing it later would change what an old backup restores as.

`schema/index.ts`: `CURRENT = 2`, `SCHEMAS = { 1, 2 }`, and `CharacterDocument`,
`CURRENT_SCHEMA` and `createCharacter` point at v2.

`src/data/schema/README.md`, "Adding a new version", step 4, says the registration point is the
only file outside a version directory that changes. It is two files: `schema/index.ts` for the
schema and `migration/migrations.ts` for the migration. Step 4 is corrected to name both.

What follows from the existing machinery, with no new code:

- A stored v1 character migrates the first time it is listed or opened, and `get()`/`list()`
  write it back at v2 (AGENTS.md, "A document that loaded by migrating is written back").
- An imported v1 file and a restored v1 cloud version migrate the same way. All three go
  through `parseCharacter`.
- **An older build that meets a v2 document reports `FROM_FUTURE`** and keeps the raw JSON. That
  happens when a player exports from the new build and imports into an installed PWA that has
  not updated, or restores a v2 cloud version on an old build (the cloud screen already flags
  `fromNewerApp`, `cloudBackup.ts`). The update prompt resolves both. Accepted: it is what the
  versioning is for.

## 4. Business layer

### 4.1 Weapons

`EquipmentBO.weapons` returns `WeaponBO[]`. `WeaponBO extends EquipmentItemBO<WeaponData>`, which
becomes generic over its node; `other` stays `EquipmentItemBO`.

```ts
interface WeaponAttack { ability: AbilityKey; attackBonus: number; damage: string }

class WeaponBO {
  get attack(): WeaponAttack | null        // a copy, never the live node

  setAttackAbility(ability: AbilityKey | null): void
  setAttackBonus(value: number): void      // integer; NO_ATTACK when attack is null
  setAttackDamage(value: string): void     // trimmed, may be empty, TOO_LONG > 80;
                                           // NO_ATTACK when attack is null
}

class EquipmentBO {
  addWeapon(init: NewEquipmentItem & { attack?: WeaponAttack | null }): WeaponBO
  addOther(init: NewEquipmentItem): EquipmentItemBO    // unchanged
}
```

- **Choosing the first ability** creates `{ ability, attackBonus: 0, damage: '' }` (§1, "Starting
  values").
- **Changing the ability keeps the attack bonus and damage.** Picking STR then fixing it to DEX
  must not wipe the number typed in between.
- **`null` clears the whole attack**, attack bonus and damage included.
- **`addWeapon` validates an attack before anything is pushed**, so a bad one leaves no half-made
  weapon.
- **Damage gets its own guard**, not `trimmedName`, which rejects an empty value (`EMPTY_NAME`).
- **`attuned` and `equipped` stay derived over both lists**, and still return
  `EquipmentItemBO[]`. The weapons among them are `WeaponBO` instances.

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
  the key is absent. Adding and deleting a key on the observable document is what `HitDicesBO`
  already does, and autosave sees it.
- **`add` takes the numbers with the ability**, so an entry never exists before the player has
  seen its fields (the dialog in §5.1 collects all three).

### 4.3 Guards and rule codes

- `ABILITY_KEYS` is duplicated into `guards.ts`, with the same comment `SPELL_SLOT_LEVELS` has in
  `counters.ts`: `src/business/` may not import a version directory. It is typed
  `satisfies readonly AbilityKey[]`, and a test checks it, in order, against a blank document's
  `abilities` keys, so a missing ability fails a test rather than passing silently.
- `abilityKey(value)` throws `UNKNOWN_ABILITY`. The type already restricts callers; this catches
  plain JavaScript or a cast, because an unknown key would make the document unsaveable.
- New `RuleCode`s, each true of every value it rejects:
  - `UNKNOWN_ABILITY`: a string that is not one of the six abilities
  - `DUPLICATE_SPELLCASTING`: that ability already has an entry
  - `NO_ATTACK`: an attack bonus or damage write on a weapon with no ability chosen
- `TOO_LONG` covers damage over 80 characters, as for names.
- **Only `TOO_LONG` is shown beside a field**, and it is already in `bind.ts`'s `PRESENTABLE`,
  the list of codes a player can cause by typing. `UNKNOWN_ABILITY`, `DUPLICATE_SPELLCASTING`
  and `NO_ATTACK` stay loud: the UI never offers an unknown ability, a used one, or a number
  field before an ability, so reaching any of them is a bug.

### 4.4 Exports

`src/business/index.ts` adds `WeaponBO`, `WeaponAttack`, `SpellListBO` (now a class),
`SpellcastingBO` and `SpellcastingEntryBO`. It still exports no `*Data` alias.

## 5. UI

Mockups, built from the running app's markup and `src/ui/styles.css` at 390 px:
`2026-09-26-attack-rolls-mockups/spell-list.png` and `…/equipment.png`. The layout below is
what they show, and was approved on 2026-09-26. New pieces reuse what the app already has: the
skill rows' grey ability tag, the proficiency toggles' look, the text button beside "Spell
Slots", the two-column dialog row.

### 5.1 Spell List: Spellcasting chips

A **Spellcasting** block above the categories, in the slot `CategorizedSection` already gives
Counters for its spell slots:

```
SPELLCASTING                                   [+ Add]
[INT  ATK +6 | DC 14]  [WIS  ATK +7 | DC 15]
[CHA  ATK +4 | DC 12]
▸ COMBAT  3/3 PREPARED                        ✎  (+)
```

- **The header** is a static section heading, "Spellcasting", with a **+ Add** text button on
  the right, the same control as Counters' "Set totals". The button is hidden when all six
  abilities have an entry.
- **One chip per entry**, in STR→CHA order. Each chip shows:
  - the ability in the grey tag the skill rows use
  - `ATK` and the attack bonus, signed and bold
  - a thin divider
  - `DC` and the save DC, bold

  The whole chip is one button that opens the edit dialog. Its accessible name reads in full,
  e.g. "Intelligence spellcasting: attack +6, save DC 14".
- **Chips wrap, never scroll.** Two fit across a phone, and a third starts a new line. Most
  characters have none or one, so the block is usually a single short line. A scroller would
  hide the last ability, which the player may need every turn, and a mouse wheel cannot reach it
  on desktop. Considered and rejected on 2026-09-26.
- **With no entries** there is no card and no chip, only one italic line under the header:
  "No spellcasting ability yet — tap “Add”." The categories move up to where they are today.

**Add dialog**, "Add spellcasting":

- **Ability**: six buttons, STR to CHA, in one row. They look like the proficiency toggles on
  Abilities & Skills: outlined, filled with the accent colour when chosen, and dimmed and
  disabled when that ability already has an entry.
- A hint under the row: "Pick the ability you cast with.", followed by "Intelligence already has
  an entry." when one is disabled.
- **Spell attack** (signed) and **Save DC** appear side by side once an ability is picked.
- **Create** is disabled until then, and writes all three in one `add`.

**Edit dialog**, titled with the ability's full name ("Intelligence"):

- a one-line hint: "Spellcasting with Intelligence. To use another ability, delete this and add one."
- **Spell attack** and **Save DC** side by side, each saving as it parses, like every number in
  the app
- **Delete** in the footer, through the existing `ConfirmDelete`

### 5.2 Equipment: weapon attacks

**A weapon row** with an attack shows it in two places:

- **Right side:** the ability in the grey tag, then the attack bonus, bold (`DEX +6`). It is
  short and fixed-width, so it never squeezes the name.
- **Preview line:** the damage comes first, in the ink colour and semibold, then ` · `, then the
  description in grey. That line already cuts off with "…", so a long damage costs nothing.

```
Rapier                                   [DEX] +6  ›
1d8+3 piercing · 1d8 piercing, finesse.
Shortbow                                           ›
1d6 piercing, range 80/320.
```

A weapon with no attack, and every item in Other Equipment, looks exactly as it does today. The
rows look the same in the derived Attuned and Equipped blocks.

**The new weapon and edit weapon dialogs** are titled "New weapon" and "Edit weapon"; other
equipment keeps "New equipment" and "Edit item". Top to bottom:

1. **Name**
2. **Attack ability**: seven buttons, *None* then STR to CHA, in one row, in the same style as
   the spellcasting picker. It sits right under the name, because the attack is what the player
   opens a weapon for mid-combat. The description is reference text.
3. When an ability is chosen:
   - **Attack bonus** (signed, a narrow 92 px column) and **Damage** (the rest of the row, with
     placeholder "e.g. 1d8+3 piercing") side by side
   - a hint below them: "None clears the attack bonus and damage."

   With *None* chosen, both fields are hidden, and the hint reads "Pick the ability you attack
   with to enter the attack bonus and damage."
4. **Description**, starting at **4 lines instead of 10**. It still grows with its text, up to
   the same limit as every description. The attack now holds the facts a player looks up, and
   at 10 lines the edit sheet reached the top of the screen.
5. **Attuned** and **Equipped**, side by side in one row, in every equipment dialog, not only
   for weapons. This gives back the height the attack fields take.

Behaviour:

- **Damage is a `NameField`** in the edit dialog: it saves on blur and on Enter, not on every
  keystroke. Saving per keystroke, as Description does, would trim the space after `1d8+3`
  before `piercing` could follow it. `NameField` already passes an empty value through, and
  shows `TOO_LONG` beside the field. In the new-weapon dialog it is a plain input in local state,
  like the name, and the text is trimmed on Create.
- **Choosing *None* in the edit dialog clears the attack at once**, with no confirmation:
  re-entering one number and a short string is cheap, and the hint says what will happen.
- **Choosing an ability after *None*** shows `+0` and an empty damage field (§1, "Starting
  values"). The mockup shows this state.

### 5.3 New UI pieces

- **`AbilityPicker`**, a new component in `src/ui/components/`, used by both dialogs:
  - props: `value: AbilityKey | null`, `onChange`, `allowNone`, and `disabled: AbilityKey[]`
  - it is a `role="radiogroup"` of buttons, each `role="radio"` with `aria-checked`
  - labels come from `reference.ts`'s `ABILITIES`
  - buttons are 34 px tall. That is under the 44 px touch guideline, but taller than the 26 px
    + buttons beside each category. Seven equal columns still leave each about 46 px wide on a
    390 px phone.
- **Styles** added to `src/ui/styles.css`, each a variation of an existing rule:

  | Class | What it is | Borrowed from |
  |---|---|---|
  | `.castchips`, `.castchip` | the wrapping chip row and one chip | `.slotblock`'s fill and border, `.skrow .ab`'s tag |
  | `.atk` | the row's `DEX +6` | `.skrow .ab` and `.valcluster` |
  | `.recopen .pv .dmg` | damage at the head of the preview | `.recopen .nm`'s ink colour |
  | `.abpick` | the picker's grid of buttons | `.mk` / `.mk.on` |
  | `.atkfields` | attack bonus and damage in one row | `.row2` |
  | `.chkpair` | Attuned and Equipped side by side | `.chkrow` |
  | `.dialog .area.brief` | the shorter weapon description | `.dialog .area` |

### 5.4 Types and binding

- `WeaponView extends EquipmentItemView` adds `attack: { ability; attackBonus; damage } | null`.
  `EquipmentView.weapons` is `WeaponView[]`. `attuned` and `equipped` hold both kinds. `bind.ts`
  builds a `WeaponView` for any item that is an `instanceof WeaponBO`, and a row checks
  `'attack' in item`.
- **`EquipmentActions.addEquipment(slot, item)` splits into `addWeapon(item)` and
  `addOther(item)`.** Only `addWeapon`'s item has an optional `attack`. Keeping one action would
  mean either an attack on other equipment silently dropped, or a runtime error for a shape the
  type allowed.
- `EquipmentActions` adds `setWeaponAttackAbility(id, ability | null)`,
  `setWeaponAttackBonus(id, n)` and `setWeaponAttackDamage(id, text): NameResult`. Damage can be
  rejected because of `TOO_LONG`.
- `SpellListView` becomes `interface SpellListView extends CategorizedView<SpellView> {
  spellcasting: SpellcastingView[] }`, the way `CountersView` adds its slots, with
  `SpellcastingView = { ability; attackBonus; saveDc }` in STR→CHA order.
- `SpellListActions` adds `addSpellcasting(ability, { attackBonus, saveDc }): void`,
  `setSpellAttackBonus(ability, n)`, `setSpellSaveDc(ability, n)` and
  `removeSpellcasting(ability)`.
- Ability labels come from `reference.ts`'s existing `ABILITIES` (`short: 'STR'` …).

## 6. Testing

Every new test is proven to bite: break what it guards, watch it (and only it) fail, restore.

- **`v2/` schema.** The copied v1 suite, retargeted at v2, plus:
  - `attack` required on weapons, and nullable
  - all six abilities accepted and nothing else
  - attack bonus signed and integer
  - damage: empty accepted, padded rejected, 81 characters rejected
  - no `attack` key allowed on other equipment
  - `spellcasting`: required, `{}` accepted, a non-ability key rejected, a negative DC rejected,
    a negative attack bonus accepted
  - new unknown-key rows: weapon attack, spellcasting record, spellcasting entry, spell-list
    section, other-equipment item
- **`blank.ts`.** The document starts with `spellcasting: {}`. Add a no-shared-substructure row
  for `spellList.spellcasting`.
- **A v1 fixture.** `docFor` builds a v2 document once `createCharacter` points at v2, and tests
  outside `schema/` cannot import `v1/`. So `src/test/fixtures.ts` gains `v1DocFor(id, name)`, a
  hand-written v1 literal, with a test that it passes `SCHEMAS[1]`. Otherwise a migration test
  could pass because its input was never valid v1 in the first place.
- **Migration.**
  - a populated v1 document becomes exactly the expected v2 document
  - the input is not mutated
  - `other` items gain no key
  - **the real Zahir file**: every weapon migrates to `attack: null` even though its
    descriptions say "Damage: 1d6 Piercing", and the result passes `SCHEMAS[2]`
  - `parseCharacter` on a v1 document returns a valid v2 document
- **Tests the version bump breaks, repointed:**
  - `indexedDbRepository.test.ts` (the migration and write-back cases): they use `docFor` as
    their "v1" document, which becomes v2 and fails `SCHEMAS[1]`. They switch to `v1DocFor`.
  - `codec.test.ts`: it expects the decoded Zahir to equal the v1 file. It comes back migrated,
    so the expectation becomes `migrateV1ToV2(zahir)`.
  - a new repository test: a stored v1 document is written back at v2 by the real registry.
- **Business.** For weapons:
  - the first ability creates an attack with attack bonus 0 and damage ''
  - changing the ability keeps the attack bonus and damage
  - `null` clears the whole attack
  - `NO_ATTACK` on an attack bonus or damage write with no attack
  - `UNKNOWN_ABILITY` on a cast
  - damage trimmed, may be empty, capped at 80
  - `attack` returns a copy, so mutating it does not reach the document
  - `addWeapon` with a bad attack pushes nothing

  For spellcasting:
  - STR→CHA order
  - `DUPLICATE_SPELLCASTING`
  - `GONE` after `remove`
  - `ABILITY_KEYS` matches the blank document's abilities, in order

  `characterSheet.roundTrip.test.ts` fills the new branches and still satisfies
  `CURRENT_SCHEMA`, and still finds no accessor that exposes the document.
- **UI.**
  - `bind.test.tsx` covers each new action, and a weapon in the Equipped list keeping its attack.
  - `AbilityPicker.test.tsx`:
    - one `aria-checked` at a time
    - a disabled ability cannot be chosen
    - *None* only when `allowNone`
  - `Equipment.test.tsx`:
    - the attack fields appear only after an ability is chosen
    - *None* clears them
    - typing `1d8+3 piercing` into damage keeps the space
    - the row shows `DEX +6` on the right and the damage leading the preview
    - other equipment has no picker and keeps its title
  - A new `SpellList.test.tsx`:
    - no entries shows the hint line
    - a chip per entry, in STR→CHA order
    - the Add dialog disables used abilities and keeps Create disabled until a pick
    - Add is hidden at six
    - edit and delete work
  - Stories and fixtures are updated: Spell List with none, one and three entries, Equipment with
    attacks. `devSeed.ts` gives its characters attacks and spellcasting, so `npm run dev` shows
    the feature.
- Test, typecheck, lint and `prettier --check` stay green.

## 7. Delivery order

Small commits, tests first, each one green:

1. `v2/` copy and its changes, with schema tests
2. `v1DocFor`, the migration, the `CURRENT` bump, the README step 4 fix, and the tests the bump
   breaks, repointed (§6)
3. `WeaponBO`, with its tests
4. `SpellcastingBO` and `SpellListBO`, with their tests
5. `AbilityPicker`, types, binding, the split add actions and the Equipment UI (§5.2)
6. the Spell List chips and dialogs (§5.1)
7. `devSeed.ts`, stories, then AGENTS.md "Current state" and the test counts. `docs/BACKLOG.md`
   gets anything deferred

## 8. Accepted risks and settled questions

- **An old tab can overwrite an upgraded character.** A tab still running the old build holds a
  v1 copy. If it autosaves after the new build wrote the same character back at v2, the v1 copy
  wins, and attacks entered in the new tab are lost; the next load migrates it again, to
  `attack: null`. Two tabs editing one character already works as "last save wins"; this adds
  losing the new fields to it. Accepted as rare: it needs an old tab and a new tab open on the
  same character across an update.
- **Multiclass with one shared ability.** A Wizard/Artificer casts with INT for both classes, so
  one entry covers both, which the D&D rules also give them. If a magic item ever makes two INT
  bonuses differ, the player records the one they use; there is no per-class split.
- **Decided: order.** Spellcasting chips are shown STR→CHA, not in the order added: a fixed
  order means a given ability is always in the same place.
- **Decided: fixed ability.** A spellcasting entry's ability cannot be changed; the player deletes
  the entry and adds another. The ability is the entry's key (§2).
- **Decided: weapons only.** Other equipment has no attack. An item that makes an attack roll
  belongs in Weapons.

## 9. Revision log

- **2026-09-26, first draft.**
- **2026-09-26, checked against the code.**
  - Ability keys stay full names.
  - `bonus` → `attackBonus` on the weapon.
  - Damage saves on blur, because per-keystroke saving trimmed its spaces.
  - Damage moved from the row's right side to the preview line, because the right side does not
    cut off long text.
  - `DUPLICATE_SPELLCASTING` is no longer shown beside a field.
  - `addEquipment` split into `addWeapon` and `addOther`.
  - The migration stays in `src/data/migration/` and is frozen once released; README step 4 is
    corrected.
  - The "+0" contradiction is settled as "Starting values" (§1).
  - The v1 fixture, the tests the bump breaks, the Zahir migration test, `devSeed.ts` and the
    old-tab risk were added.
- **2026-09-26, UI laid out and approved.**
  - §5 rewritten from mockups built in the app's own markup and CSS (§5, first paragraph).
  - Spellcasting is a row of chips, not a card of rows. The chips wrap; scrolling was
    considered and rejected.
  - The weapon dialogs put Attack ability right under Name, as a row of buttons rather than a
    select.
  - The weapon description starts shorter, and Attuned and Equipped share one row.
  - `AbilityPicker` is added as a component.
- **2026-09-26, open items closed.** Order, fixed ability and weapons-only confirmed as designed (§8).
