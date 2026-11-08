# Companions — Design

A Companions section for the creatures a character brings along: a familiar, a paladin's steed, a
Beast Master's beast, a Vestige Patron's vestige, a Steel Defender, a summoned spirit. Each
companion reads like a small copy of the character sheet:
- the same HP, Temp, Hit Dices, AC and Initiative tiles
- the same ability table
- a free-text stat block
- a few counters of its own

The app computes none of it (AGENTS.md, "What this is"). "AC 13 + your Charisma modifier" in a
stat block is resolved by the player, who types 16. Needs character schema v8.

The design also makes the two blocks on the character's own Abilities & Skills screen fold (§7).
The owner asked for that during this design.

Status: **built 2026-11-08** on branch `feature/companions`, from `docs/superpowers/plans/2026-11-08-companions.md`.

Mockups: `2026-11-08-companions-mockups/`.
- **`companions.html`:** a clickable page that uses the app's real `src/ui/styles.css`. Open it
  through the dev server at `/docs/superpowers/specs/2026-11-08-companions-mockups/companions.html`.
  - `?open=vestige,owl` opens companions.
  - `?dialog=edit&c=owl` opens the Companion dialog.
  - `?theme=dark` switches the theme.
- **Six screenshots, at 412px unless noted:**
  - `01-folded-light`: the screen as it opens, every companion folded
  - `02-vestige-open-light`: Initiative off, Hit Dices on
  - `03-owl-open-light`: Initiative on, Hit Dices off
  - `04-companion-dialog-light`
  - `05-hit-dices-dialog-light`
  - `06-vestige-open-320-dark`: 320px, dark

Background research (the 2024 stat blocks, which companions have Hit Dice, skills and saves) is
summarised in §1. Rules quoted there were checked against SRD 5.2.1, D&D Beyond's free 2024
rules, and the Vestige Patron Unearthed Arcana PDF.

## 1. Decisions

"Owner" marks a decision the app's owner made. "Designer" marks a call made while designing,
which the owner saw and did not change.

| Decision | Choice | Who, and why |
|---|---|---|
| What a companion holds | **Fields for Name, Hit Points (current and total), Temp, Hit Dices, AC, Initiative and the six abilities.** Everything else goes in one free-text **Stat block** | Owner. These are what every 2024 companion stat block shares and what changes in play. Speed, Senses, Languages, Resistances, CR, Traits and Actions are read, not tracked |
| Skills | **In the Stat block text**, not fields | Owner, after research. Every companion skill is the ability modifier plus PB, or plus twice PB (expertise). Only familiars list any, 0 to 3 each, usually Perception and Stealth. Beasts, vestiges and defenders list none but add the owner's PB to every check |
| Abilities | **Score, Mod and Save, no P mark** | Owner ("we do not use it here"). The 2024 stat block prints only the final save. The Save holds the number the player rolls, including a bond trait's PB, which the player adds by hand |
| Death saving throws | **None** | Owner. No companion makes them: at 0 HP a familiar, steed or vestige disappears, and a beast or defender dies |
| Limited uses | **Each companion has its own Counters list, flat, with no categories** | Owner. The Vestige's Divine Power (1/Day), the steed's once-per-long-rest bonus actions, the Steel Defender's Repair (3/Day) and the Sphinx of Wonder's Burst of Ingenuity (2/Day) belong to the creature and are printed in its stat block |
| Initiative | **`number \| null`**, set by a **Rolls initiative** switch. Off, the tile reads **"Uses yours"** | Owner. A familiar rolls its own. The steed, beast, vestige and defender act on the owner's turn, and summons and the Homunculus take their turn right after it. "Uses yours" is true of all of them, where "Your turn" would be wrong for the last two |
| Hit Dices | **A record or `null`**, set by a **Hit Dices** switch. Off, the tile reads **"No hit dices"** | Owner, the same split as Initiative. Beasts (d8, d6 for Sky), the steed (d10), the vestige (d6) and the Steel Defender (d8) have a real pool they can spend on a short rest. Familiars only show the dice behind their HP, and summons have none |
| Layout | **The Companions screen looks like the sheet.** Each companion is a foldable section like a category. Inside: the vitals tiles, Abilities, Stat block, Counters | Owner |
| Stat block box | **Inline textarea, like Notes.** It starts at 8 rows and grows with its text where the browser supports `field-sizing` | Owner chose inline editing over a dialog, because the app already edits Notes directly. The growth came after validation found the attack line hidden below row 8, inside a box that scrolls within a scrolling page |
| What starts open | **Companions start folded**, like categories, and a companion just created opens. Inside an open companion, Abilities, Stat block and Counters start open | Owner, after validation. With everything open, a second companion's HP sat about 1000px down |
| Repeated names | **Allowed.** Everything is keyed by id | Owner, after validation. Animate Dead gives three Skeletons. Items already allow repeats; categories and classes do not |
| The ✎ dialog | **Name, the two switches, Delete companion** | Owner. Everything else is edited on the sheet |
| Abilities & Skills screen | **Its Abilities and Skills blocks fold** (§7) | Owner, asked for during this design |
| Not in this design | Present / dismissed flag, long-rest button, companion portrait, type label (Familiar / Mount…), Duplicate companion | Owner. A long-rest button would apply rules, and the app computes nothing |

## 2. Schema v8

v7 is frozen: it is on `main`. `v8/` starts as a literal copy of `v7/` and diverges only as listed
here (AGENTS.md, "Schema versions are isolated by construction").

```ts
schemaVersion: 8
// every v7 key, unchanged, in v7's order
companions: z.array(companionItem),          // NEW, required, the last key of the document

const companionAbility = z
  .object({ score: nonNegativeInt, modifier: signedInt, savingThrowModifier: signedInt })
  .strict();

const companionItem = z
  .object({
    id: uuid,
    name: shortName,
    hitPoints: currentAndTotal.extend({ temporary: nonNegativeInt }).strict(),
    hitDices: z.record(dieSizeKey, currentAndTotal).nullable(),
    armorClass: nonNegativeInt,
    initiative: signedInt.nullable(),
    abilities: fixedKeys(ABILITY_KEYS, companionAbility),
    description: longText,
    counters: z.array(countersItem),
  })
  .strict();
```

- **A plain `z.object`, not `nameAndDescription.extend(...)`.** Zod 4.4.3 emits keys in the
  schema's order, whatever order the input had (measured during validation), and stored
  documents are Zod's output. With `.extend`, the stat block would sit second, before the
  numbers, in the raw-JSON editor. In this order it comes after them.
- **`counters` reuses v8's own `countersItem`**, so a companion's counter is exactly a character
  counter. It emits v7's key order: `name, description, id, current, total, step`.
- **`null` means switched off.**
  - `hitDices: null` means the companion has no Hit Dices. `{}` means switched on with no die yet.
  - `initiative: null` means it uses its owner's initiative. `0` is a real `+0`.
- **No `current ≤ total` rule**, as everywhere else in the document.
- **Ids.** `idsWithPaths` gains every companion id at `['companions', i, 'id']`, and every counter
  id inside one at `['companions', i, 'counters', j, 'id']`. A reused id anywhere in the document
  is still rejected.
- **Names** are `shortName`: rejected when padded, at most 80 characters. Repeats are allowed (§1).
- **Strict.** Every new object schema (`companionItem`, its `hitPoints`, `companionAbility`) gets
  its row in the strictness table, and the id rows go in the duplicate-id table.
- **Blank document:** `companions: []`, last.
- **Unchanged:** `DB_VERSION`, the cloud layout, and the export envelope `{ sheet, portrait }`. A
  companion's text counts toward the existing 1 MiB cloud quota like any other text.

## 3. Migration v7 → v8

`migrateV7ToV8` sets `schemaVersion: 8` and adds `companions: []`, last, with a plain spread. It
reads nothing else: not a Ranger class, not a spell named "Find Familiar", not a counter named
"Owl HP". Frozen once released, like every migration.

It is registered in `schema/index.ts` (`CURRENT = 8`) and `migration/migrations.ts`.

## 4. Business layer

### Classes

- **`CharacterSheetBO.companions: CompanionsBO`.** It is assigned in the constructor, never as a
  field initialiser, like the other subtrees.
- **`CompanionsBO`:**
  - **`items: CompanionBO[]`** is built from the live array on every read.
  - **`add(name: string): CompanionBO`** trims the name (`trimmedName`) and builds the blank
    companion described below. It stores it with `pushAndRead` and returns a `CompanionBO` over the
    stored node, never over the literal.
- **The blank companion** is built in the business layer, as the counter fill in `counters.ts`
  builds a blank counter. It uses `ABILITY_KEYS` from `guards.ts`, and the round-trip test proves
  it satisfies `CURRENT_SCHEMA`. It has:
  - HP 0/0, Temp 0, AC 0
  - `hitDices: null` and `initiative: null`
  - every ability `{ 0, 0, 0 }`
  - `description: ''` and `counters: []`
- **`CompanionBO extends NamedItemBO<CompanionData>`:**
  - **Name and text, from `NamedItemBO`:** `id`, `name`, `setName` (trims, no duplicate check),
    and `description` / `setDescription`. `setDescription` is the stat block, which is never
    trimmed.
  - **`remove()`** splices the companion out of the live `companions` array.
  - **`hitPoints: CreatureHitPointsBO`**, the shared base described below.
  - **`armorClass`** and `setArmorClass` (`nonNegativeInt`).
  - **`initiative: number | null`:**
    - `setRollsInitiative(on)` does `node.initiative = on ? (node.initiative ?? 0) : null`. Turning
      it on keeps a number that is already there, as `WeaponBO.setStackable` keeps a count.
    - `setInitiative(value)` checks the value with `integer()` first, then throws the new
      `NO_INITIATIVE` while initiative is `null`, as `setCount` throws `NOT_STACKABLE`.
  - **`hitDices: HitDicesBO | null`** is a getter that reads `node.hitDices` on every access.
    `setHasHitDices(on)` does `node.hitDices = on ? (node.hitDices ?? {}) : null`.
  - **`abilities: Record<AbilityKey, CreatureAbilityBO>`.**
  - **`counters: CompanionCountersBO`.**
- **`CompanionCountersBO`:**
  - `items: CompanionCounterBO[]`
  - `add({ name, description })`, which takes the same `NewNamedItem` as `CountersBO.add`
  - The rest of "a new counter starts full" stays where the Counters screen keeps it: `bind.ts`
    sets the step, the total and `current = total` after the add.
- **`CompanionCounterBO extends NamedItemBO<CounterData>`.**
  - **Setters:** `current`, `total` and `step`, with the same guards as `CounterBO`: `decimal`,
    and `positiveDecimal` for the step.
  - **`remove()`** splices it out of its companion's live counters.
  - **It does not reuse `CounterBO`.** `CounterBO` extends `CategorizedItemBO`, whose
    constructor needs a categorized owner, and a fake owner would expose a `moveTo` that throws
    `UNKNOWN_CATEGORY` with a false message. TypeScript allows only one superclass, so the three
    getter and setter pairs are repeated. Each is a one-line guard call.

### Shared bases

The character's classes become subclasses of these, and their behaviour does not change.

- **`CreatureHitPointsBO`:** `current`, `total` and `temporary` with their setters. `HitPointsBO
  extends` it and adds `deathSaves`. This split is needed because `HitPointsBO` builds a
  `DeathSavesBO` in its constructor, and a companion has no `deathSaves` node.
- **`CreatureAbilityBO`:** `score`, `modifier` and `savingThrowModifier`. `AbilityBO extends` it
  and adds `savingThrowProficient`.

### Hit Dices that can be switched off

Switching Hit Dices off and on replaces the record. MobX stores a copy of an assigned object, so a
`HitDicesBO` held from before the switch would write into a detached record. Nothing would save,
and nothing would report it. Validation reproduced this against the installed MobX 7.0.3. So:

- **`HitDicesBO` and `HitDieBO` resolve their record on every access**, through a resolver
  `() => record | null`, instead of holding it.
  - **The character** passes `() => doc.hitDices`, so its behaviour is unchanged.
  - **A companion** passes `() => node.hitDices`.
  - **While it is `null`,** every call throws `GONE`.
- **Adding to a removed companion throws `GONE`.** A setter on a removed item already writes to
  its detached node without complaint, and that stays. But an add must not mint ids into a
  detached companion. `CategoryBO.add` follows the same rule (`categorized.ts`). This covers both
  `hitDices.add` and `counters.add`.
- **`bind.ts` looks up the companion, its dice and its counters by id when a callback runs,**
  as `dieOfSize` already does for the character.

### Rules and exports

- **`NO_INITIATIVE`** is the one new `RuleCode`. It is not in `PRESENTABLE`, because the field is
  hidden while initiative is off, so only a UI bug can reach it.
- **`index.ts`** exports `CompanionsBO`, `CompanionBO`, `CompanionCountersBO`,
  `CompanionCounterBO`, `CreatureHitPointsBO` and `CreatureAbilityBO`. It never exports
  `CompanionData` or any other `*Data`.
- **`deepObserve` and `Autosave`** must see every change, including `null` ↔ object switches and
  a die added right after switching on. A test covers it (§8).

## 5. UI: the Companions screen

### Hub

- **The section entry** is `{ key: 'companions', icon: ICONS.paw, title: 'Companions',
  subtitle: 'familiars & mounts' }`, last in `SECTIONS`. `ICONS.paw` is a new icon in the
  set's style. The route comes with it, because routes are built from `SECTIONS`.
- **The hub summary** lists companions in order as `Name current/total`, with ` +temp` when
  temporary HP is above 0. The format is shared with the folded vitals header's `summariseVitals`
  through one formatter. At most two companions are named, then `N more`: `Vestige 9/16 +5 · Owl
  0/1 · 1 more`. That keeps each named HP visible at 320px, where the summary line is about 188px
  wide. With no companions, the summary follows what the other sections show when empty.

### Screen

```
‹ Companions                                  sticky screen title

▸ Owl   [0/1]                         ✎       folded
▾ Vestige   [9/16]                    ✎       open; sticks under the title while its body scrolls
  ┌ HIT POINTS  [−] 9 [+] / 16    TEMP [−] 0 [+] ┐
  ├ HIT DICES 2/3 d6 ┤ (AC 16) ├ INITIATIVE  Uses yours ┤
  ▾ ABILITIES
    ABILITY  SCORE  MOD  SAVE
    STR      [ 1]   [-5] [-2]      …six rows
  ▾ STAT BLOCK
    [ textarea, 8 rows and up ]
  ▾ COUNTERS                                  [+]
    Divine Power   Bonus action…    [−] 1 [+] / 1

[ + New companion ]
```

- **The companion heading** is the category heading: `.sechead-row`, then a `button.sechead`
  holding the caret, the name and the `.ccount` pill, then the `.editcat` ✎ in `.sec-actions`.
  - **The pill** shows HP in the hub summary's format (`9/16`, `9/16 +5`). It does not show a
    count.
  - **The fold button fills the row up to ✎** and is at least 40px tall. A bare `.sechead` is
    about 24px tall and only as wide as its text.
  - **While a companion is open, its heading row is sticky** directly under `.svhead`, so the name
    and HP pill stay visible above its tiles and abilities.
- **The tiles** are the vitals header's own, extracted from `VitalsHeader.tsx` into a shared
  component that the header and each companion render. It takes:
  - a label prefix
  - hit points `{ current, total, temporary }`
  - `hitDices: HitDieView[] | null`
  - `armorClass`
  - `initiative: number | null`
  - narrow actions
- **The two "off" tiles** are not interactive, and their text is a state, not a number. It is set
  quieter than a value: 14px UI font in `--ink-2`.
  - Initiative off reads **Uses yours**. "Your turn" wrapped to two lines at 320 and 360px.
  - Hit Dices off reads **No hit dices**.
- **Hit Dices on** is the header's button tile: "Tap to set up" with no die, or a summary such as
  `2/3 d6`. It opens the Hit Dices dialog, extracted from `VitalsHeader.tsx` with the header.
  - **Titles:** **Hit Dices** for the character, **Vestige: Hit Dices** for a companion. The
    character's identical tile is pinned on the same screen, so the title names whose dice they
    are.
- **Abilities** reuse `AbilityRow`, exported with two changes:
  - **The P mark is optional.** Without it the row uses the grid `44px 1fr 1fr 1fr`, so Save is a
    box like Score and Mod.
  - **It takes a label prefix**, for the accessible names below.
- **The Stat block** is a `.area` textarea with `rows={8}`. Under `@supports (field-sizing:
  content)` it grows with its text, with a minimum height of 8 rows. Elsewhere it stays at 8 rows
  and scrolls, as Notes does. There is no maximum, because the block folds.
  - **Its placeholder** (the designer's call) is `Speed, senses, traits, actions…`.
  - **It has no `id` derived from the name**, because the `aria-label` names it.
- **Counters:**
  - **Rows** are the Counters screen's `CounterRow`, exported.
  - **The `+` on the label** opens the Counters screen's new-counter dialog, and a row opens its
    edit dialog. Both dialogs get an optional category picker, which is omitted for a companion.
    An empty picker still renders a select with "Uncategorized", so it is omitted, not emptied.
  - **Labels** stay the dialogs' own: Name, Remaining, Total, Step, Note.
  - **With no counters,** only the label and `+` show.
- **The three sub-headings** are small fold buttons: a caret plus the `.dlabel` text, with
  `aria-expanded`, at least 32px tall. Counters keeps its `+` beside its fold button, so a counter
  can be added while the list is folded.
- **+ New companion** (`.newcat`) opens a dialog like New category: `AddByName` with the label
  "Companion name", the placeholder "e.g. Owl" and the button "+ Create". The new companion opens.

### The Companion dialog (✎)

```
Companion                                        ×
COMPANION NAME   [ Owl                        ]
☑ Rolls initiative
  Leave it off if it uses your initiative.
☐ Hit Dices
  Leave it off if it has none.
                                  [ Delete companion ]
```

- **The name** uses `NameField`, which commits on blur, as elsewhere.
- **The switches** are `CheckRow`s calling `setRollsInitiative` and `setHasHitDices` when they
  change. The dialog never writes them on close.
- **Switching off forgets the value without asking.** Off clears the initiative or the dice, as
  the Pact magic switch and Stackable already do.
- **Delete companion** goes through `ConfirmDelete`, unlike the Category dialog. Deleting a
  category moves its entries to Uncategorized, but deleting a companion loses its numbers, text
  and counters.

### Fold state

There is one `usePersistedState<Record<string, boolean>>` per character,
`ui:${characterId}:companions`. It is view state, never in the document. Each value records
whether that block is open; a key that is absent means the default.

| Key | Default |
|---|---|
| `${companionId}` | folded. Creating a companion writes it as open |
| `${companionId}/abilities`, `/statblock`, `/counters` | open |

Keys use the id, never the name, because names may repeat.

### Accessible names

Every control inside a companion starts with the companion's name, in the character's own
wording. Without that, two open companions plus the pinned header would give several controls
with the same name.

- **Hit points:**
  - "Vestige current hit points", "Vestige total hit points" and "Vestige temporary hit points"
  - their steppers: "Decrease Vestige current hit points" and the rest
- **Other tiles:**
  - "Vestige armor class", "Vestige initiative"
  - the Hit Dices tile button: "Vestige Hit Dices 2/3 d6", its summary included (see "Buttons that show a value" below)
- **Abilities:** "Vestige STR score", "Vestige STR modifier", "Vestige STR saving throw".
- **Fold buttons:** the heading's name is the companion's name, plus "Vestige abilities",
  "Vestige stat block" and "Vestige counters".
- **Other controls:**
  - "Edit companion Vestige"
  - "Add counter to Vestige"
  - the textarea: "Vestige stat block"
- **Counter rows** take the prefix too, through an optional `labelPrefix` on `CounterRow`:
  - the stepper becomes "Vestige Divine Power remaining", with "Decrease Vestige Divine Power
    remaining" and its Increase twin
  - the row's open button is "Vestige Divine Power", through a new optional `label` on `ItemRow`
  - without the prop, as on the Counters screen, every name stays as it is today: the row's
    button is still named by its visible text, which `Counters.test.tsx` matches with
    `/^Lantern oil/`
- **Buttons that show a value keep the value in their name, with the companion's name first.**
  That way a screen reader still hears the numbers.
  - The heading's fold button is named by its visible text, "Vestige 9/16".
  - A companion's Hit Dices tile is "Vestige Hit Dices 2/3 d6".
  - The character's own tile keeps its name, "Hit Dices …", which `VitalsHeader.test.tsx` matches
    with `/^Hit Dice/`.

Two companions that share a name share these names. That is the same as two counters that share a
name today.

### Views, actions and rendering

- **Types.** `CompanionView` and `CompanionsActions` are added to `ui/types.ts`. Actions are
  addressed by companion id, and counter actions by companion id plus counter id.
- **`createSheetViews` gains one `companions` computed.** Inside it the nested parts are kept
  first and the companion last:
  - `keep.one('companion#${id}/ability#${key}')`
  - the counters list, keyed per companion
  - `keep.list('companions', views)`
- **Rendering.** The companion block is `memo`, with stable callbacks, so stepping one
  companion's HP re-renders that companion only. A test asserts it, as `bind.test.tsx` does for
  Inventory.
- **The dev seed** gives Sable Nightwind a Vestige and an Owl through the ordinary business API.

## 6. Copy

| Where | Text |
|---|---|
| Hub | `Companions` / `familiars & mounts` |
| New button and dialog | `+ New companion`, title `New companion`, label `Companion name`, placeholder `e.g. Owl`, button `+ Create` |
| ✎ dialog | title `Companion`, `Companion name`, `Rolls initiative`, `Leave it off if it uses your initiative.`, `Hit Dices`, `Leave it off if it has none.`, `Delete companion` |
| Off tiles | `Uses yours`, `No hit dices` |
| Sub-headings | `Abilities`, `Stat block`, `Counters` |
| Hit Dices dialog title | `Hit Dices` (character), `<Name>: Hit Dices` (companion) |

## 7. Abilities & Skills: the two blocks fold

The **Abilities** and **Skills** headings on the character's Abilities & Skills screen are today's
static `.sechead`. They become fold buttons like Equipment's blocks: the caret, the name, and
`aria-expanded`.

- **Both start open.** Only a fold is remembered, per character, in
  `usePersistedState('ui:${characterId}:abilities', {})`. That is Equipment's rule.
- **The screen gains a `characterId` prop for that key.** `CharacterHub` passes it, as it already
  does for Equipment and Counters.
- **Prof. Bonus, Passive Perc. and Speed** above them do not fold.
- **No data changes.**

## 8. Testing

Every new test is broken once on purpose to prove it bites (AGENTS.md, "Traps").

### Schema `v8/`

- the v7 tests, copied
- strictness rows for `companionItem`, its `hitPoints` and `companionAbility`
- duplicate-id rows for a companion id and a companion's counter id
- `hitDices` accepts `null`, `{}` and `{ "6": { current: 2, total: 3 } }`, and rejects `{ "06": … }`
- `initiative` accepts `null`, `0` and `-1`, and rejects `1.5`
- a padded name and an 81-character name are rejected
- a 20 001-character description is rejected
- the blank document ends with `companions: []`
- the key order of a parsed companion matches the schema's, whatever the input's order

### Migration

- `v7ToV8.test.ts`, against a new `v7DocFor`:
  - it is a hand-written v7 literal with v7's own fields filled in, for example a counter at
    `current: 4.5, step: 0.5`, so a migration that reset steps would show
  - it carries the bait: a Ranger 3 class, a spell "Find Familiar", a feat "Primal Companion", and
    a counter "Owl HP" at 1/1
  - `fixtures.test.ts` checks it against `SCHEMAS[7]`
- the real-registry test (`indexedDbRepository.test.ts`) and `codec.test.ts` extended to v8
- `characterLifecycle.test.ts` carries a companion with `initiative: 0` and `hitDices: {}` through
  export, import, save, list and get. These are the values a falsy check would turn into `null`.

### Business

- `setRollsInitiative` and `setHasHitDices`:
  - on, off, and on again
  - turning a switch on while it is already on keeps the value
- `setInitiative` while off throws `NO_INITIATIVE`, after the integer check
- Hit Dices off → on → `add(6)` → the d6 is in `toDocument()`
- a `HitDicesBO` held across an off → on still writes to the live record
- while off, a held `HitDicesBO` throws `GONE`
- adding to a removed companion throws `GONE`, for dice and for counters
- `CreatureHitPointsBO` and `CreatureAbilityBO`:
  - the character's `HitPointsBO` and `AbilityBO` tests pass unchanged
  - a companion has no death saves and no P
- `CompanionCounterBO` guards: `TOO_PRECISE`, `NOT_POSITIVE` for a step of 0, `NEGATIVE`
- the round trip:
  - the fill adds one companion with every branch non-null: initiative set, a d6 at 2/3, every
    ability, a description, and a counter with step 0.125
  - it adds a second companion left at `add()`'s defaults
  - the result satisfies `CURRENT_SCHEMA`, and no accessor exposes the document
- `deepObserve`/`Autosave` sees a die added right after switching Hit Dices on

### UI

- **Companions screen:**
  - companions start folded and a created one opens
  - fold state is keyed by id: two companions named "Skeleton" fold separately
  - the off tiles show their text and take no input
  - accessible names carry the companion's name, counter rows included
  - the Counters screen's names are unchanged
  - Delete companion asks for confirmation
- **Extracted pieces.** `VitalsHeader`, `AbilitiesAndSkills` and `Counters` tests pass unchanged
  after the tiles, `AbilityRow`, `CounterRow` and the counter dialogs are extracted.
- **`bind.test.tsx`:**
  - stepping one companion's HP re-renders that companion only
  - every companion action reaches the right companion by id
- **`hubSummary.test.ts`:** two companions, a third as `1 more`, and temp HP as `+5`.
- **Abilities & Skills:** folding each block, remembered across a remount for the same character
  only.
- **Stories:** a Companions story, with `src/ui/fixtures.ts` gaining two companions.

### In the browser

**Who runs it.** The build agent runs these checks in the Playwright browser, against a Vite dev
server on a spare port. A different port is a different origin, with its own IndexedDB and
localStorage. So the steps below that clear storage or write into it (a fresh dev seed, a v7
document put straight into IndexedDB, empty fold state) never touch the owner's characters on the
usual dev port. Anything jsdom or fake-indexeddb can check is a unit test instead.

Chromium at 320px, 360px and 412px, light and dark:
- create a companion, set its numbers, tick Rolls initiative and Hit Dices, add a d6, reload: all
  of it survives
- a stored v7 document opens with no companions and is written back as v8, with `companions`
  last
- the Stat block grows with its text, and its attack line is visible without scrolling the box
- an open companion's heading stays under the title while its body scrolls
- nothing scrolls sideways at 320px, including with an 80-character name

## 9. Out of scope

- a Duplicate companion action
- a long-rest or short-rest button
- companion portraits
- a present / dismissed flag
- a companion type label
- reordering companions (they stay in creation order)
- moving counters between a companion and the character
- death saves for companions

## 10. Deviations

Where the build departed from this design or from the plan, and why. The progress ledger's
rulings are the source for the first eight; the ninth came from the browser checks.

- **`HitDicesBO.items` returns `[]` while the dice are switched off.** §4 says every call throws
  `GONE` while the record is `null`. Every other call does. `items` is the one exception, made in
  the plan, so a list of nothing reads as nothing rather than throwing out of a render.
- **The blank counter is one `newCounter` in `counters.ts`,** shared by `CountersBO.add` and
  `CompanionCountersBO.add`. The plan had the companion's list build its own copy; review found
  the two fills duplicated, and one function keeps "a new counter" defined once.
- **`CompanionCounterBO` repeats `CounterBO`'s three guarded setters,** as §4 already says. The
  build kept it as planned: a mixin or a fake categorized owner would cost more than six one-line
  guard calls.
- **A companion's Hit Dices tile is named "Vestige Hit Dices 2/3 d6".** §5 named it two ways: a
  bullet said "Vestige hit dices", and the later "Buttons that show a value" rule keeps the value.
  The later rule won, so a screen reader hears the dice, and the bullet is corrected above.
- **`usePersistedState`'s setter is stable** (`useCallback([key])`), in `src/ui/persistedState.ts`,
  a file outside the plan. §5 requires one companion's HP step to re-render that companion only,
  and a fresh setter on every render made every memoised block's fold callback new, so every block
  re-rendered. Other screens using the hook see no change in behaviour.
- **Each companion's heading and body are wrapped in a `div.compblock`.** The plan and the mockup
  put them directly in `.sv` as siblings. A sticky box sticks within its parent, so there every
  heading, folded or not, stuck and stacked under the title. Inside its own block a heading
  sticks only while that block's body scrolls past, is pushed out where the block ends, and has
  nowhere to move while folded: §5's "while a companion is open". Because every heading is now
  the first `div` in its block, `.sechead-row.companion` restates `margin-top: 22px`, which
  `.sechead-row:first-of-type` would otherwise cut to 10px.
- **The heading's tap band reaches 2px past its 40px button, not `.editcat`'s 7px.** 44px is the
  tap target already. A 7px band under a pinned heading lay over whatever had scrolled beneath it,
  so a tap on an HP stepper could fold the companion instead. Measured in Chromium: with the
  stepper 3px under a pinned heading, a tap 3.5px below the heading lands on the stepper.
- **The dev seed's Vestige has a 3rd-level warlock's numbers.** The plan said `4 + 4 × Sable's
  Warlock level`, but the seeded Sable Nightwind is Rogue (Arcane Trickster) 5 / Wizard (Evoker)
  2, with no warlock level. She has both companions anyway, as §5 says: the Owl fits her wizard
  levels, and the Vestige is sample data the app never checks against classes. It is HP 16/16,
  AC 16, initiative off, and hit dices on with a d6 at 3/3. The Owl is at 1/1, where the mockup's
  is at 0/1.
- **A companion's tiles split hit dices and initiative equally.** §5 says the tiles are the vitals
  header's own, and they are the same component, but the header's columns give hit dices two
  thirds of the space beside the AC shield. In a companion that left the initiative tile 44px of
  content at 320px and 57px at 360px in Chromium, and "Uses yours" (59px) wrapped to two lines,
  as the mockup's own 320px screenshot shows. `.compbody .tiles` uses
  `minmax(0, 1fr) auto minmax(0, 1fr)`: each tile is 98.5px wide at 320px and both off tiles stay
  on one line. A companion rarely has more than one die size, so its hit dices need less room
  than a multiclass character's. The header is unchanged.
- **Kept as designed after checking in the browser:**
  - `--svhead-h` stays 50px: `.svhead` measured 50px at 320px, 360px and 412px.
  - The first companion heading sits 22px below the title, which is where every other section's
    first heading sits: `.sechead-row:first-of-type` never matches inside `.sv`, because `.svhead`
    is its first `div`.
  - In the counter edit dialog opened from a companion, the Step field is alone in its `.row2`
    and spans the dialog's width, under Remaining and Total. It reads as a full-width field like
    Name, not as a missing column, so it is left as it is.
