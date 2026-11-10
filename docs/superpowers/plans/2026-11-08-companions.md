# Companions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Companions section: each companion has HP, Temp, Hit Dices (switchable), AC,
Initiative (switchable), abilities, a free-text stat block and its own flat counters. It is stored
as `companions` in a new character schema v8. The two blocks on the Abilities & Skills screen also
learn to fold.

**Architecture:**
- **Schema.** `v8/` is a copy of `v7/` plus one strict `companionItem` list. `migrateV7ToV8` adds
  `companions: []`.
- **Business layer.**
  - The character's hit point and ability classes gain shared bases (`CreatureHitPointsBO`,
    `CreatureAbilityBO`) that companions reuse.
  - `HitDicesBO` resolves its record on every access, so it can live under a switch.
  - New `companions.ts` holds `CompanionsBO`, `CompanionBO`, `CompanionCountersBO` and
    `CompanionCounterBO`.
- **UI.**
  - The vitals tiles, the Hit Dices dialog, `AbilityRow`, `CounterRow` and the counter dialogs are
    extracted so a companion renders them too.
  - `bind.ts` gains one `companions` computed and a by-id action set.
  - A new `Companions` screen and a hub entry use them.

**Tech Stack:** TypeScript 6, Zod 4.4.3, MobX 7, React, Vitest 4 + Testing Library, ESLint 10,
Playwright MCP for the browser checks.

**Spec:** `docs/superpowers/specs/2026-11-08-companions-design.md`, with mockups in
`docs/superpowers/specs/2026-11-08-companions-mockups/`. Read both before starting.

## Global Constraints

**Where the work happens**
- Work in the worktree `F:/git/DnD-Character-sheet-companions` on branch `feature/companions`,
  created from `main`. Never switch branches in `F:/git/DnD-Character-sheet`: other sessions
  share that checkout.
- Shared working tree rules apply anyway: stage only the files your task lists, by path. Never
  use `git add -A` or `git add .`.

**Rules that come from the app**
- The app computes nothing. No value is read from a class, a spell or a counter name, nothing
  refills on a rest, and there is no `current ≤ total` rule.
- `src/data/schema/v7/` and every older version directory are frozen: never edit them. A released
  migration is frozen too. `migrateV7ToV8` reads nothing.

**Schema**
- Every object schema is `.strict()`.
- Ids are `z.uuidv4()` and unique across the whole document, companion ids and companion counter
  ids included.
- Names are `shortName`: rejected when padded, 80 characters at most, and they may repeat.
- A companion's key order is
  `id, name, hitPoints, hitDices, armorClass, initiative, abilities, description, counters`.
  `companions` is the last key of the document.
- `hitDices: null` means switched off and `{}` means on with no die. `initiative: null` means
  "uses yours" and `0` is `+0`.

**Business layer**
- A switch turned on keeps an existing value (`?? 0`, `?? {}`), and turned off sets `null`. There
  is no confirmation.
- One new `RuleCode`, `NO_INITIATIVE`. It is not in `PRESENTABLE`.

**UI copy, exactly**
- Hub: `Companions` / `familiars & mounts`, icon `ICONS.paw`, the last entry in `SECTIONS`.
- New companion:
  - the button is `+ New companion`
  - the dialog title is `New companion`
  - it is `AddByName` with `label="Companion name"`, `placeholder="e.g. Owl"` and `button="Create"`
- The ✎ dialog:
  - title `Companion`, then `Companion name`
  - the `Rolls initiative` switch and its hint `Leave it off if it uses your initiative.`
  - the `Hit Dices` switch and its hint `Leave it off if it has none.`
  - `Delete companion`, which goes through `ConfirmDelete` with `what="The companion <Name>"`
- Off tiles: `Uses yours` and `No hit dices`.
- Sub-headings: `Abilities`, `Stat block`, `Counters`.
- Stat block placeholder: `Speed, senses, traits, actions…`.
- Hit Dices dialog title: `Hit Dices` for the character, `<Name>: Hit Dices` for a companion.
- HP format: `9/16`, or `9/16 +5` when temporary HP is above 0, in the pill, the hub and the
  folded vitals header.
- Hub summary: at most two companions, then `N more`. `Nothing yet` when there are none.

**Accessibility and fold state**
- Accessible names inside a companion start with its name, in the character's wording:
  - `Vestige current hit points`, `Vestige total hit points`, `Vestige temporary hit points`
  - `Vestige armor class`, `Vestige initiative`
  - `Vestige STR score`, `Vestige STR modifier`, `Vestige STR saving throw`
  - fold buttons `Vestige abilities`, `Vestige stat block`, `Vestige counters`
  - `Vestige stat block` (the textarea)
  - `Edit companion Vestige`, `Add counter to Vestige`
  - counter rows: `Vestige Divine Power remaining` (the stepper) and `Vestige Divine Power`
    (the row's button)
  - the Hit Dices tile: `Vestige Hit Dices <summary>`
  - the heading's fold button keeps its visible text: `Vestige 9/16`
  - Without a prefix, every existing name is unchanged.
- Fold state lives in `usePersistedState<Record<string, boolean>>('ui:${characterId}:companions', {})`.
  Each value means "is open".
  - `${companionId}` defaults to folded. Creating a companion writes `true`.
  - `${companionId}/abilities`, `/statblock` and `/counters` default to open.
  - Abilities & Skills uses `ui:${characterId}:abilities`, where a value means "collapsed",
    Equipment's rule.

**Before every commit and in the browser**
- Before every commit run `npm test`, `npm run typecheck`, `npm run lint` and
  `npx prettier --check .`. All must be green.
- Every new test is broken once on purpose to prove it bites (only that test fails), then
  restored (AGENTS.md "Traps").
- Commit messages use Conventional Commit prefixes, lower-case clauses, and end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Browser checks run against `npx vite --port 5299` started inside the worktree: a separate
  origin, never the owner's dev port.

## Review Focus

1. **Hit Dices switched off, on, then a die added.** The die must reach `toDocument()` and an
   autosave, and a `HitDicesBO` held from before must write to the new record. Pinned in Task 4
   and Task 5.
2. **Two companions named "Skeleton".** Folding one, stepping its HP, or opening its ✎ dialog
   must affect that one only, by id. Pinned in Task 8.
3. **A switch that is already on, turned on again.** That includes a re-render of the dialog: it
   must keep the dice or the initiative. The dialog calls the setters on change only, never on
   close. Pinned in Task 5 (business) and Task 8 (dialog).
4. **A migrated v7 document in the raw-JSON editor.** `companions` must sit last, and a parsed
   companion's keys in schema order whatever the input order. Pinned in Task 1 and Task 2.
5. **A 320px phone with an 80-character companion name.** The name ellipsises, the pill and ✎
   stay visible, `Uses yours` and `No hit dices` stay on one line, and nothing scrolls sideways.
   Checked in Task 10, in the browser.

---

## File map

| File | Change |
|---|---|
| `src/data/schema/v8/*` | Create: copy of `v7/`, plus `companionItem` and `companions` |
| `src/data/schema/index.ts` | `CURRENT = 8`, `SCHEMAS[8]`, aliases to v8 |
| `src/data/migration/v7ToV8.ts` (+ test), `migrations.ts` | The migration, registered |
| `src/test/fixtures.ts`, `fixtures.test.ts` | `v7DocFor` with v7's fields filled in and the bait |
| `src/data/remote/codec.test.ts`, `src/data/repository/indexedDbRepository.test.ts`, `src/data/characterLifecycle.test.ts` | Extend the pinned chain; carry a companion |
| `src/business/hitPoints.ts`, `abilitiesAndSkills.ts` (+ tests) | `CreatureHitPointsBO`, `CreatureAbilityBO` bases |
| `src/business/hitDices.ts` (+ test), `characterSheet.ts` | Resolver instead of a held record |
| `src/business/companions.ts` (+ test), `errors.ts`, `types.ts`, `index.ts`, `characterSheet.ts`, `characterSheet.roundTrip.test.ts`, `deepObserve.test.ts` | The companion classes |
| `src/ui/format.ts` (+ test) | `formatHitPoints` |
| `src/ui/components/VitalTiles.tsx`, `HitDiceDialog.tsx`, `AbilityRow.tsx`, `Mark.tsx`, `ItemRow.tsx` | Extracted or extended shared pieces |
| `src/ui/screens/VitalsHeader.tsx`, `AbilitiesAndSkills.tsx`, `Counters.tsx` | Use the extracted pieces; export `CounterRow` and the counter dialogs |
| `src/ui/types.ts`, `src/ui/screens/CharacterHub.tsx`, `src/ui/bind.ts` (+ `bind.test.tsx`), `src/ui/fixtures.ts` | Views, actions, binding |
| `src/ui/screens/Companions.tsx` (+ test, story), `hubSummary.ts` (+ test), `src/ui/components/icons.tsx`, `src/ui/styles.css` | The screen |
| `src/ui/screens/AbilitiesAndSkills.tsx` (+ test, story) | The two blocks fold |
| `src/devSeed.ts`, `AGENTS.md`, `docs/BACKLOG.md`, the spec | Seed, record, deviations |

---

### Task 0: Worktree, and commit the design

**Files:**
- Create the worktree, then add the spec, the mockups and this plan in it.

- [ ] **Step 1:** Create the worktree and install:
      `git -C F:/git/DnD-Character-sheet worktree add -b feature/companions F:/git/DnD-Character-sheet-companions main`,
      then `npm ci` inside it.
- [ ] **Step 2:** Copy these three into the same paths in the worktree, then delete the
      originals from the main checkout (they are untracked and ours):
      - `docs/superpowers/specs/2026-11-08-companions-design.md`
      - `docs/superpowers/specs/2026-11-08-companions-mockups/`
      - `docs/superpowers/plans/2026-11-08-companions.md`
- [ ] **Step 3:** Run `npm test` in the worktree. Expect every test to pass, as on `main`.
- [ ] **Step 4: Commit:** `docs: companions design, mockups and plan (schema v8)`.

### Task 1: Schema v8

**Files:**
- Create: `src/data/schema/v8/` (`blank.ts`, `blank.test.ts`, `document.ts`, `document.test.ts`,
  `index.ts`, `primitives.ts`, `primitives.test.ts`), copied from `v7/`
- Modify: only files inside `v8/`

**Interfaces:**
- Produces: `characterDocumentV8Schema`, `type CharacterDocumentV8`, and `createCharacter` (v8),
  all from `src/data/schema/v8/index.js`. `CharacterDocumentV8['companions'][number]` has the
  shape in spec §2.

- [ ] **Step 1: Copy v7 and rename it to v8.**
  - `cp -r src/data/schema/v7 src/data/schema/v8`
  - In `src/data/schema/v8/*.ts`, run `sed -i` with these expressions:
    - `s/characterDocumentV7Schema/characterDocumentV8Schema/g`
    - `s/CharacterDocumentV7/CharacterDocumentV8/g`
    - `s/Schema v7, frozen/Schema v8, frozen/`
    - `s/what a v7 character document/what a v8 character document/`
    - `s/editing v7's meaning/editing v8's meaning/`
    - `s/every object schema in v7/every object schema in v8/`
    - `s/passes the v7 schema/passes the v8 schema/`
    - `s/schemaVersion: z.literal(7)/schemaVersion: z.literal(8)/`
    - `s/schemaVersion: 7,/schemaVersion: 8,/`
    - `s/schemaVersion: 7 as const/schemaVersion: 8 as const/`
    - `s/expect(doc.schemaVersion).toBe(7)/expect(doc.schemaVersion).toBe(8)/`
  - Then edit `document.test.ts:196-197` by hand. The test title becomes "exactly 8", and its
    wrong version becomes `schemaVersion: 7`.
  - In `blank.test.ts:115`, rename `migrateV6ToV7` to `migrateV7ToV8`.
  - Check with `grep -n "V7\|literal(7)\|schemaVersion: 7\|toBe(7)" src/data/schema/v8/*.ts`.
    Expect exactly two hits: `document.ts:85` (the 7th spell level) and the hand-edited
    `document.test.ts:197`.
  - Do **not** run a blanket `s/7/8/`: `attackBonus: 7` and spell `level: 7` must stay.
- [ ] **Step 2: Write the failing tests in `v8/document.test.ts` and `v8/blank.test.ts`.**
  - **The fixture:** `validDocument()` gains `companions` as its last key. It holds one
    companion with id `12121212-1212-4212-8212-121212121212`:
    - `name: 'Vestige'`
    - `hitPoints: { current: 9, total: 16, temporary: 0 }`
    - `hitDices: { '6': { current: 2, total: 3 } } as Record<string, {current:number;total:number}> | null`
    - `armorClass: 16`
    - `initiative: null as number | null`
    - every ability `{ score, modifier, savingThrowModifier }`
    - `description: 'Small Undead'`
    - one counter `{ name: 'Divine Power', description: '', id: '13131313-1313-4313-8313-131313131313', current: 1, total: 1, step: 1 }`
  - **Value tests**, as `it.each` blocks with a `withCompanion(patch)` helper:
    - `hitDices` accepts `null`, `{}` and `{ '6': { current: 2, total: 3 } }`, and rejects
      `{ '06': … }`
    - `initiative` accepts `null`, `0` and `-1`, and rejects `1.5`
    - the name rejects `' Owl'` and `'x'.repeat(81)`
    - the description rejects `'x'.repeat(20001)`
    - each of the nine companion keys is required
  - **Strictness table rows:** the companion, its `hitPoints`, an ability, a counter inside a
    companion, and one die in its `hitDices`.
  - **Duplicate-id table rows:**
    - `'companion'`: `doc.companions[0]!.id = doc.classes[0]!.id`
    - `'companion counter'`: `doc.companions[0]!.counters[0]!.id = doc.classes[0]!.id`
  - **A new key-order test:** parse a companion literal written in reverse key order, then expect
    `Object.keys(parsed.companions[0])` to equal
    `['id','name','hitPoints','hitDices','armorClass','initiative','abilities','description','counters']`.
  - **`blank.test.ts`:**
    - `'starts every collection empty'` gains `expect(doc.companions).toEqual([])`
    - a new test, `'puts companions last'`: `Object.keys(doc).at(-1) === 'companions'`
    - a `'companions'` row in `does not share substructure between documents`
- [ ] **Step 3: Run, and expect failures.**
  - Command: `npx vitest run src/data/schema/v8`
  - Expect FAIL: unknown key `companions`.
- [ ] **Step 4: Implement in `v8/document.ts` and `v8/blank.ts`.**
  - Add `companionAbility` and `companionItem` after `fixedKeys`, exactly as in spec §2: a
    plain `z.object`, not `nameAndDescription.extend`.
  - Add `companions: z.array(companionItem)` as the last key of `documentShape`.
  - In `idsWithPaths`, after the `fromCategorized` calls, add:
    `doc.companions.forEach((c, i) => { found.push([['companions', i, 'id'], c.id]); fromList(['companions', i, 'counters'], c.counters); })`
  - In `blank.ts`, add `companions: []` last.
- [ ] **Step 5: Run, and expect a pass.**
  - Command: `npx vitest run src/data/schema/v8`
  - Expect PASS. Break `idsWithPaths` for counters and watch only that row fail, then restore.
- [ ] **Step 6: Commit:** `feat(schema): add v8 with companions`.
  - Stage only `src/data/schema/v8/`.

### Task 2: Migration v7 → v8, and v8 current

**Files:**
- Create: `src/data/migration/v7ToV8.ts`, `v7ToV8.test.ts`
- Modify:
  - `src/data/migration/migrations.ts` (import, plus `[7, migrateV7ToV8]`)
  - `src/data/schema/index.ts`:
    - a plain v7 import
    - the v8 import
    - `CURRENT = 8` and `8: characterDocumentV8Schema`
    - `CharacterDocument`, `CURRENT_SCHEMA` and `createCharacter` pointed at v8
    - the comment at `:43`
  - `src/test/fixtures.ts`, `fixtures.test.ts`
  - `src/data/remote/codec.test.ts`
  - `src/data/repository/indexedDbRepository.test.ts`
  - `src/data/characterLifecycle.test.ts`

**Interfaces:**
- Consumes: Task 1's `characterDocumentV8Schema`.
- Produces: `migrateV7ToV8: Migration` and `v7DocFor(id: string, name: string): Record<string, unknown>`.
  From here `CharacterDocument` includes `companions`.

- [ ] **Step 1: `v7DocFor` in `src/test/fixtures.ts`**, after `v6DocFor`.
  - It spreads `v6DocFor`, sets `schemaVersion: 7`, and gives every counter `step`.
    The Lantern oil counter gets `current: 4.5, step: 0.5`. Every other counter gets `step: 1`.
  - It adds the bait:
    - a class `{ id: V7_RANGER_ID, name: 'Ranger', level: 3 }`
    - a spell `{ name: 'Find Familiar', description: '', id: V7_FAMILIAR_SPELL_ID, level: 1, prepared: true }` in `spellList.uncategorized`
    - a feat `{ name: 'Primal Companion', description: '', id: V7_PRIMAL_FEAT_ID }` in `featsAndTraits.uncategorized`
    - a counter `{ name: 'Owl HP', description: '', id: V7_OWL_HP_ID, current: 1, total: 1, step: 1 }` in `counters.uncategorized`
  - The new private ids are uuidv4 repdigits not used yet: `b2b2…`, `c3c3…`, `d4d4…`, `e5e5…`.
    Each uses the `4` and `8` nibbles, like `a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1`.
  - Add a JSDoc naming the bait, ending "`fixtures.test.ts` checks it against `SCHEMAS[7]`".
  - In `fixtures.test.ts`, add a `describe('v7DocFor')` row checking it against `SCHEMAS[7]`.
- [ ] **Step 2: Write the failing tests in `v7ToV8.test.ts`**, mirroring `v6ToV7.test.ts`.
  - `'adds an empty companions list and changes nothing else'`:
    - first assert the bait is present
    - then `toEqual({ ...v7, schemaVersion: 8, companions: [] })`
  - `'puts companions last'`: `Object.keys(v8)` equals `[...Object.keys(v7), 'companions']`.
  - `'produces a valid v8 document'`: `SCHEMAS[8]!.safeParse(...)`.
  - `'does not mutate its input'`.
  - `describe('parseCharacter on a v7 document')` › `'runs it through this migration on the way to the current version'`:
    `schemaVersion` is `CURRENT`, and `companions` equals `[]`.
- [ ] **Step 3: Run, and expect failures.**
  - Command: `npx vitest run src/data/migration/v7ToV8.test.ts src/test/fixtures.test.ts`
  - Expect FAIL: module `./v7ToV8.js` not found.
- [ ] **Step 4: Implement and wire it.**
  - `migrateV7ToV8` returns `{ ...doc, schemaVersion: 8, companions: [] }`.
  - Give it a JSDoc like `v6ToV7.ts`'s: what it adds, "reads nothing else", where the key lands,
    and that it is frozen once released.
  - Register it in `migrations.ts` and switch `schema/index.ts` to v8.
- [ ] **Step 5: Extend the pinned-chain tests.**
  - In `codec.test.ts:40-47` and `indexedDbRepository.test.ts:360-375`, wrap the existing
    chain in `migrateV7ToV8(…)` and import it.
  - In `characterLifecycle.test.ts`, assign `created.companions` the following, with a comment
    saying "0 and {}, not null, so a hop that reads them as off fails":
    - one companion with id `f6f6f6f6-f6f6-4f6f-8f6f-f6f6f6f6f6f6`
    - `initiative: 0`, `hitDices: {}`, `name: 'Owl'`
    - abilities filled with distinct numbers
    - one counter with id `0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a` at `current: 0.5, step: 0.25`
- [ ] **Step 6: Run everything.**
  - Run `npm test` and `npm run typecheck`. Expect PASS: the business layer still compiles,
    because nothing reads `companions` yet.
  - Prove it bites: make the migration read the counters, for example add a companion named
    after "Owl HP". Watch only the `v7ToV8` test fail, then restore.
- [ ] **Step 7: Commit:** `feat(schema): migrate v7 to v8 and make v8 current`.

### Task 3: Shared bases for hit points and abilities

**Files:**
- Modify:
  - `src/business/hitPoints.ts`
  - `src/business/abilitiesAndSkills.ts`
  - `src/business/types.ts` (add `CreatureHitPointsData`, `CreatureAbilityData`)
  - `src/business/index.ts`
- Test: `src/business/hitPoints.test.ts`, `src/business/abilitiesAndSkills.test.ts`

**Interfaces:**
- Produces:
  - **`CreatureHitPointsBO`:** `constructor(node: CreatureHitPointsData)`, where
    `CreatureHitPointsData = { current: number; total: number; temporary: number }`. It has getters
    and setters for `current`, `total` and `temporary`, every setter `nonNegativeInt`.
    `HitPointsBO extends CreatureHitPointsBO`, keeps `deathSaves`, and behaves as before.
  - **`CreatureAbilityBO`:** `constructor(node: CreatureAbilityData)`, where
    `CreatureAbilityData = { score: number; modifier: number; savingThrowModifier: number }`.
    - `score` / `setScore` use `nonNegativeInt`.
    - `modifier` / `setModifier` and `savingThrowModifier` / `setSavingThrowModifier` use `integer`.
  - **`AbilityBO extends CreatureAbilityBO`** and adds `savingThrowProficient` /
    `setSavingThrowProficient`.
  - Both bases hold their own `#node`. A subclass keeps its own `#node` for its extra field.
  - Both are exported from `index.ts`.

- [ ] **Step 1: Failing tests.**
  - `hitPoints.test.ts`: `'a CreatureHitPointsBO has no death saves'`, asserting
    `not.toHaveProperty('deathSaves')`, plus its setters' guards (`NEGATIVE`, `NOT_AN_INTEGER`).
  - `abilitiesAndSkills.test.ts`: `'a CreatureAbilityBO has no saving throw proficiency'`,
    asserting `not.toHaveProperty('savingThrowProficient')`.
  - `'a HitPointsBO is a CreatureHitPointsBO'` and `'an AbilityBO is a CreatureAbilityBO'`,
    using `instanceof`.
- [ ] **Step 2: Run, and expect failures.**
  - Command: `npx vitest run src/business/hitPoints.test.ts src/business/abilitiesAndSkills.test.ts`
  - Expect FAIL: the classes are not exported.
- [ ] **Step 3: Implement the two bases** and make the character classes extend them.
- [ ] **Step 4: Run `npm test`.** Expect PASS, with every existing character test unchanged.
- [ ] **Step 5: Commit:** `refactor(business): shared bases for a creature's hit points and abilities`.

### Task 4: Hit dice resolve their record on every access

**Files:**
- Modify: `src/business/hitDices.ts`, `src/business/characterSheet.ts:57`
- Test: `src/business/hitDices.test.ts`

**Interfaces:**
- Produces: `new HitDicesBO(resolve: () => HitDices | null)` and
  `new HitDieBO(resolve: () => HitDices | null, size: number)`.
  - **While `resolve()` returns `null`,** every getter, setter, `add` and `remove` throws
    `RuleViolation('GONE', 'these hit dice are switched off or no longer in the document')`.
  - **`items`** returns `[]`, not a throw, so a view can read it.
  - **The character** passes `() => this.#doc.hitDices`.

- [ ] **Step 1: Failing tests in `hitDices.test.ts`.**
  - **A switchable record:** `const holder = observable({ dice: {} as Record<string, {current:number,total:number}> | null })`
    and `const bo = new HitDicesBO(() => holder.dice)`. Then:
    - `'writes to the record the resolver returns now'`: `const held = bo`, then
      `holder.dice = null; holder.dice = {}`, then `held.add(6)`. Expect `holder.dice` to equal
      `{ '6': { current: 0, total: 0 } }`.
    - `'throws GONE while the resolver returns null'`: `holder.dice = null`, then
      `expect(() => bo.add(6))` to throw code `GONE`.
    - `'lists nothing while switched off'`: `bo.items` equals `[]`.
- [ ] **Step 2: Run, and expect failures.**
  - Command: `npx vitest run src/business/hitDices.test.ts`
  - Expect FAIL: wrong constructor argument.
- [ ] **Step 3: Implement.**
  - Replace `#dice` with `#resolve`, and add a private `#record()` that resolves or throws `GONE`.
  - `HitDieBO` keeps its existing `GONE` for a missing key.
- [ ] **Step 4: Run, and expect a pass.**
  - Run `npm test`. Expect PASS: every character hit-dice test and the round trip are unchanged.
- [ ] **Step 5: Commit:** `refactor(business): hit dice resolve their record on every access`.

### Task 5: Companions in the business layer

**Files:**
- Create: `src/business/companions.ts`, `src/business/companions.test.ts`
- Modify:
  - `src/business/errors.ts` (`'NO_INITIATIVE'`)
  - `src/business/types.ts`:
    - `CompanionData = CharacterDocument['companions'][number]`
    - `CompanionCounterData = CompanionData['counters'][number]`
  - `src/business/characterSheet.ts`
  - `src/business/index.ts`
  - `src/business/characterSheet.roundTrip.test.ts`
  - `src/business/deepObserve.test.ts`
  - `src/business/autosave.test.ts`

**Interfaces:**
- Consumes: Task 3's bases and Task 4's resolver.
- Produces, in `companions.ts`, all exported from `index.ts`:
  - **`CharacterSheetBO.companions: CompanionsBO`**, assigned in the constructor.
  - **`CompanionsBO`:**
    - `get items(): CompanionBO[]`
    - `add(name: string): CompanionBO`
      - It trims the name, fills the blank companion from spec §4 using `ABILITY_KEYS` from
        `guards.ts` and `createId()`, then calls `pushAndRead`.
      - It returns a `CompanionBO` over the stored node.
  - **`CompanionBO extends NamedItemBO<CompanionData>`**, constructed with `(node, siblings)`:
    - **`remove()`** is inherited and throws `GONE` on a second remove.
    - **Fields built in the constructor:**
      - `readonly hitPoints: CreatureHitPointsBO`
      - `readonly abilities: Record<AbilityKey, CreatureAbilityBO>`
      - `readonly counters: CompanionCountersBO`
    - **Armor class:** `armorClass: number` and `setArmorClass(value: number): void`, using
      `nonNegativeInt`.
    - **Initiative:**
      - `initiative: number | null`
      - `setRollsInitiative(on: boolean): void` does `node.initiative = on ? (node.initiative ?? 0) : null`.
      - `setInitiative(value: number): void` checks `integer(value)` first. Then, while
        initiative is `null`, it throws `NO_INITIATIVE` with
        `` `${name} does not roll initiative; switch it on first` ``.
    - **Hit dice:**
      - `get hitDices(): HitDicesBO | null` reads the node on every access. It returns
        `new HitDicesBO(() => this.#live() ? this.node.hitDices : null)`, or `null` when the node
        holds `null`.
      - `setHasHitDices(on: boolean): void` does `node.hitDices = on ? (node.hitDices ?? {}) : null`.
      - `#live()` is `this.siblings.includes(this.node)`.
  - **`CompanionCountersBO`:** `constructor(companion: CompanionData, companions: CompanionData[])`.
    - `get items(): CompanionCounterBO[]` reads `companion.counters` on every access. Each item
      is a `CompanionCounterBO(node, companion.counters)`.
    - `add(init: NewNamedItem): CompanionCounterBO` throws `GONE` when
      `!companions.includes(companion)`. Otherwise it fills
      `{ id, name, description, current: 0, total: 0, step: 1 }` the way `CountersBO` does, then
      calls `pushAndRead`.
  - **`CompanionCounterBO extends NamedItemBO<CompanionCounterData>`:**
    - `current` / `setCurrent` and `total` / `setTotal` use `nonNegativeDecimal`.
    - `step` / `setStep` uses `positiveDecimal`.
    - `remove()` is inherited.

- [ ] **Step 1: Failing tests in `companions.test.ts`.** It uses the `sheetFor()` helper, like
      the other business tests.
  - **`add`:**
    - `'adds a blank companion that satisfies the schema'`: `CURRENT_SCHEMA` parses
      `toDocument()`, and `companions[0]` equals the spec's blank with `name: 'Owl'`.
    - `'trims the name and allows a repeated one'`: two `add('Skeleton')` calls, then
      `add(' Owl ')`, gives the names `'Skeleton'`, `'Skeleton'`, `'Owl'`.
    - `'rejects an empty or overlong name'`: `EMPTY_NAME` and `TOO_LONG`.
  - **Initiative:**
    - `'switches initiative on at +0, keeps it when switched on again, forgets it when off'`
    - `'sets initiative while on, and throws NO_INITIATIVE while off, after the integer check'`.
      While off, 1.5 gives `NOT_AN_INTEGER` and 3 gives `NO_INITIATIVE`.
  - **Hit dice:**
    - `'switches hit dice on with none, keeps the dice when switched on again, clears them when off'`
    - `'adds a die after switching off and on, and the die is in the document'`: on, `add(4)`,
      off, on, `add(6)`. Then `toDocument().companions[0].hitDices` equals
      `{ '6': { current: 0, total: 0 } }`.
    - `'a hit dice object held across off and on writes to the live record'`
    - `'a hit dice object held while off throws GONE'`
  - **Removal:** `'adding a die or a counter to a removed companion throws GONE'`.
  - **Counters:** `'companion counters guard like character counters'`. A step of 0 gives
    `NOT_POSITIVE`, `1.0005` gives `TOO_PRECISE`, and `-1` gives `NEGATIVE`.
  - **Abilities:** `'companion abilities have no saving throw proficiency'`.
- [ ] **Step 2: Run, and expect failures.**
  - Command: `npx vitest run src/business/companions.test.ts`
  - Expect FAIL: module not found.
- [ ] **Step 3: Implement** `companions.ts`, add the rule code and the type aliases, and assign
      `this.companions = new CompanionsBO(this.#doc.companions)` in the `CharacterSheetBO`
      constructor.
- [ ] **Step 4: Extend the existing tests.**
  - **`roundTrip` `fill`:**
    - `Owl`, with initiative on and set to 1, hit dice on with `add(6).setTotal(3)`, every
      ability set to distinct values, and a description
    - a counter with `setStep(0.125)`, `setTotal(6)`, `setCurrent(4.5)`
    - a second companion `'Skeleton'` left at its defaults
  - **`overLongWrites`** gains `a companion name`, `a companion rename` and
    `a companion stat block`.
  - **`unsafeWrites`** gains `a companion's initiative`: `setInitiative(-UNSAFE)` after
    switching it on.
  - **`deepObserve.test.ts` › `CharacterSheetBO.observe`** gains
    `'sees a die added right after switching a companion's hit dice on'`.
  - **`autosave.test.ts`** gains `'saves a companion's die added after switching hit dice on'`.
- [ ] **Step 5: Run, and expect a pass.**
  - Run `npm test`. Expect PASS.
  - Prove it bites: make `get hitDices()` cache its object, and watch only the
    off-then-on tests fail. Restore.
- [ ] **Step 6: Commit:** `feat(business): companions, with switchable initiative and hit dice`.

### Task 6: Extract the shared UI pieces

Behaviour is unchanged. The character's screens must render and test exactly as before.

**Files:**
- Create:
  - `src/ui/components/VitalTiles.tsx`
  - `src/ui/components/HitDiceDialog.tsx`
  - `src/ui/components/AbilityRow.tsx`
  - `src/ui/components/Mark.tsx`
- Modify:
  - `src/ui/format.ts` (+ `format.test.ts`)
  - `src/ui/components/ItemRow.tsx`
  - `src/ui/screens/VitalsHeader.tsx`
  - `src/ui/screens/AbilitiesAndSkills.tsx`
  - `src/ui/screens/Counters.tsx`

**Interfaces:**
- Produces:
  - **`formatHitPoints(hp: { current: number; total: number; temporary: number }): string`** in
    `format.ts`. It gives `'9/16'`, or `'9/16 +5'` when temporary HP is above 0.
    `summariseVitals` uses it as `` `HP ${formatHitPoints(hp)}` ``.
  - **`summariseHitDice(dice: readonly HitDieView[]): string`** in `VitalTiles.tsx`, exported.
    It is today's function, taking the dice list instead of the character.
  - **`VitalTiles`** in `VitalTiles.tsx`:
    ```ts
    interface TileActions {
      setCurrentHitPoints(value: number): void; setTotalHitPoints(value: number): void;
      setTemporaryHitPoints(value: number): void; setArmorClass(value: number): void;
      setInitiative(value: number): void;
    }
    function VitalTiles(props: {
      labelPrefix?: string;                      // 'Vestige' → 'Vestige current hit points'
      hitPoints: { current: number; total: number; temporary: number };
      hitDices: readonly HitDieView[] | null;    // null renders the 'No hit dices' tile
      armorClass: number;
      initiative: number | null;                 // null renders the 'Uses yours' tile
      actions: TileActions;
      onOpenHitDice(): void;
      children?: ReactNode;                      // inside .tile.hp, after Temp: the header's DeathSaves
    }): JSX.Element
    ```
    - **Labels without a prefix** are today's: `Current hit points`, `Total hit points`,
      `Temporary hit points`, `Armor class`, `Initiative`.
    - **Labels with a prefix** are `${prefix} current hit points` and so on.
    - **The Hit Dices tile button** gets `aria-label={`${prefix} Hit Dices ${summary}`}` only
      when there is a prefix.
    - **The off tiles** are `div.tile` holding `div.tl` and `span.tval.off`, with no input.
  - **`HitDiceDialog`** in `HitDiceDialog.tsx`:
    ```ts
    interface HitDieActions {
      addHitDie(size: number): NameResult; setHitDieCurrent(size: number, value: number): void;
      setHitDieTotal(size: number, value: number): void; removeHitDie(size: number): void;
    }
    function HitDiceDialog(props: { open: boolean; onClose(): void; title?: string; dice: readonly HitDieView[]; actions: HitDieActions }): JSX.Element
    ```
    The `title` defaults to `'Hit Dices'`.
  - **`Mark`** in `Mark.tsx`, moved unchanged: `{ label; letter; on; onChange(value: boolean) }`.
  - **`AbilityRow`** in `AbilityRow.tsx`, `memo`:
    ```ts
    interface AbilityRowActions {
      setAbilityScore(key: AbilityKey, value: number): void; setAbilityModifier(key: AbilityKey, value: number): void;
      setSavingThrowModifier(key: AbilityKey, value: number): void;
      setSavingThrowProficient?(key: AbilityKey, value: boolean): void;
    }
    function AbilityRow(props: {
      ability: (typeof ABILITIES)[number];
      value: { score: number; modifier: number; savingThrowModifier: number; savingThrowProficient?: boolean };
      actions: AbilityRowActions;
      labelPrefix?: string;   // 'Vestige' → 'Vestige STR score'
    }): JSX.Element
    ```
    - It renders the P `Mark` only when `value.savingThrowProficient !== undefined`.
    - Without it, the row's class is `abrow nomark` and the Save `NumberField` is a direct child.
  - **`ItemRow`** gains an optional `label?: string`, which becomes the `aria-label` of
    `button.recopen`.
  - **`Counters.tsx`** exports the following. Without the new props, everything renders as today.
    - **`CounterRow`**, with a new optional `labelPrefix?: string`:
      - the stepper label becomes `${prefix} ${name} remaining`
      - the `ItemRow` gets `label={`${prefix} ${name}`}`
    - **`NewCounterDialog`**, with `categories?: CategoryView<CounterView>[]`. When it is
      `undefined`, no `CategorySelect` renders.
    - **`EditCounterDialog`**, whose props become
      `{ counter: CounterView; categoryId?: string | null; categories?: CategoryView<CounterView>[]; actions: CounterEditActions; onClose(): void }`.
      `CounterEditActions` is `Pick<CountersActions, 'renameCounter' | 'setCounterDescription' | 'setCounterCurrent' | 'setCounterTotal' | 'setCounterStep' | 'removeCounter'> & { moveCounter?: CountersActions['moveCounter'] }`.
      No `CategorySelect` renders without `categories`.

- [ ] **Step 1: Failing tests.**
  - `format.test.ts`: `formatHitPoints` gives `'9/16'` and `'9/16 +5'`.
  - New component tests:
    - `VitalTiles.test.tsx`:
      - labels without a prefix
      - labels with a prefix
      - `null` hit dice renders `No hit dices`, with no button
      - `null` initiative renders `Uses yours`, with no input
      - with a prefix, the Hit Dices button is named `Vestige Hit Dices 2/3\u00a0d6`
    - `AbilityRow.test.tsx`: no `P` without `savingThrowProficient`, and the prefixed labels.
- [ ] **Step 2: Run, and expect failures.**
  - Command: `npx vitest run src/ui/format.test.ts src/ui/components`
  - Expect FAIL.
- [ ] **Step 3: Implement the extractions** and switch the three screens to them. The `DeathSaves`
      block goes in `VitalTiles`'s `children`.
- [ ] **Step 4: Run, and expect a pass.**
  - Run `npm test`. Expect PASS, with `VitalsHeader.test.tsx`, `AbilitiesAndSkills.test.tsx` and
    `Counters.test.tsx` unchanged. Also run `npm run typecheck` and `npm run lint`.
- [ ] **Step 5: Commit:** `refactor(ui): share the vitals tiles, the hit dice dialog, the ability row and the counter row`.

### Task 7: Views and actions for companions

**Files:**
- Modify:
  - `src/ui/types.ts`
  - `src/ui/screens/CharacterHub.tsx` (`SheetData`, `SheetActions`)
  - `src/ui/bind.ts`
  - `src/ui/bind.test.tsx`
  - `src/ui/fixtures.ts`
  - `SectionKey` does not change until Task 8, so `hubSummary.ts` and the hub's section switch
    are untouched here.

**Interfaces:**
- Produces, in `types.ts`:
  ```ts
  interface CompanionAbilityView { score: number; modifier: number; savingThrowModifier: number }
  interface CompanionView {
    id: string; name: string;
    hitPoints: { current: number; total: number; temporary: number };
    hitDices: HitDieView[] | null; armorClass: number; initiative: number | null;
    abilities: Record<AbilityKey, CompanionAbilityView>; description: string; counters: CounterView[];
  }
  type AddResult = { ok: true; id: string } | { ok: false; message: string };
  interface CompanionsActions {
    addCompanion(name: string): AddResult;
    renameCompanion(id: string, name: string): NameResult; removeCompanion(id: string): void;
    setCompanionCurrentHitPoints(id: string, value: number): void;
    setCompanionTotalHitPoints(id: string, value: number): void;
    setCompanionTemporaryHitPoints(id: string, value: number): void;
    setCompanionArmorClass(id: string, value: number): void;
    setCompanionRollsInitiative(id: string, on: boolean): void;
    setCompanionInitiative(id: string, value: number): void;
    setCompanionHasHitDices(id: string, on: boolean): void;
    addCompanionHitDie(id: string, size: number): NameResult;
    setCompanionHitDieCurrent(id: string, size: number, value: number): void;
    setCompanionHitDieTotal(id: string, size: number, value: number): void;
    removeCompanionHitDie(id: string, size: number): void;
    setCompanionAbilityScore(id: string, key: AbilityKey, value: number): void;
    setCompanionAbilityModifier(id: string, key: AbilityKey, value: number): void;
    setCompanionSavingThrowModifier(id: string, key: AbilityKey, value: number): void;
    setCompanionDescription(id: string, text: string): void;
    addCompanionCounter(id: string, counter: { name: string; description: string; total: number; step: number }): void;
    renameCompanionCounter(id: string, counterId: string, name: string): NameResult;
    setCompanionCounterDescription(id: string, counterId: string, text: string): void;
    setCompanionCounterCurrent(id: string, counterId: string, value: number): void;
    setCompanionCounterTotal(id: string, counterId: string, value: number): void;
    setCompanionCounterStep(id: string, counterId: string, step: number): void;
    removeCompanionCounter(id: string, counterId: string): void;
  }
  ```
- `SheetData.companions: CompanionView[]` and `SheetActions.companions: CompanionsActions`.
- `fixtures.ts` gains `companions: CompanionView[]` (the Vestige and the Owl from the mockup),
  `noCompanionsActions`, and `companions` in `sheetData` and `noSheetActions`.

- [ ] **Step 1: Failing tests in `bind.test.tsx`.**
  - `toSheetData` › `'mirrors every section of a filled document'` gains a filled companion: both
    switches on, a die, a counter. Assert `data.companions` against `toDocument()`.
  - `toSheetActions` › `'edits an existing item through each by-id setter'` gains every companion
    action, with distinct values, asserted against the document. That includes a second
    companion with the same name, so a by-name lookup would fail.
  - `'adds a companion and returns its id'`: `addCompanion('Owl')` returns `{ ok: true, id }`,
    and `id` is `toDocument().companions[0].id`. `addCompanion('')` returns
    `{ ok: false, message: … }`.
  - `'a new companion counter starts full'`: current equals total after `addCompanionCounter`.
  - `'rethrows NO_INITIATIVE'`: `setCompanionInitiative` while off throws `/switch it on/`.
  - The `useSheet` memo probe test gains probes `vestige` and `owl` over `data.companions[0]` and
    `[1]`. `sheet.companions.items[0]?.hitPoints.setCurrent(5)` must re-render
    `['companions', 'vestige']` only.
- [ ] **Step 2: Run, and expect failures.**
  - Command: `npx vitest run src/ui/bind.test.tsx`
  - Expect FAIL.
- [ ] **Step 3: Implement in `bind.ts`.**
  - **`companionsView(sheet)`** builds the views, reading `bo.hitDices?.items` and
    `bo.initiative`.
  - **The `companions` computed in `createSheetViews`** keeps the nested parts first, then the
    list:
    - `keep.one('companion#${id}/ability#${key}', …)` for each ability
    - `keep.list('companion#${id}/counters', counters)`
    - `keep.list('companions', views)`
  - **`companionsActions(sheet)`** looks things up at call time:
    - the companion: `companion = (id) => byId(sheet.companions.items, id, 'companion')`
    - a die: `companion(id).hitDices`, throwing `GONE` when it is `null`, then the die by size,
      the way `dieOfSize` does
    - a counter: `byId(companion(id).counters.items, counterId, 'counter')`
  - **`addCompanion`** wraps `attempt` and returns `AddResult`.
  - **`addCompanionCounter`** sets the step, then the total, then `current = total`, as
    `addCounter` does.
  - **Comments.** Update the "eight computeds" and "other seven" comments (`:373`, `:378`,
    `:762`).
- [ ] **Step 4: Run, and expect a pass.**
  - Run `npm test`. Expect PASS.
  - Prove it bites: key `keep.list('companions', …)` by name, and watch the same-name test fail.
    Restore.
- [ ] **Step 5: Commit:** `feat(ui): bind companions to views and by-id actions`.

### Task 8: The Companions screen and its hub entry

**Files:**
- Create:
  - `src/ui/screens/Companions.tsx`
  - `src/ui/screens/Companions.test.tsx`
  - `src/ui/screens/Companions.stories.tsx`
- Modify:
  - `src/ui/types.ts`: `SectionKey` gains `'companions'`, and `SECTIONS` gains its entry last
  - `src/ui/components/icons.tsx` (`paw`)
  - `src/ui/screens/CharacterHub.tsx` (`case 'companions'`)
  - `src/ui/screens/hubSummary.ts` (+ test)
  - `src/ui/styles.css`

**Interfaces:**
- Consumes:
  - Task 6: `VitalTiles`, `HitDiceDialog`, `AbilityRow`, `CounterRow`, `NewCounterDialog`,
    `EditCounterDialog`, `formatHitPoints`
  - Task 7: `CompanionView`, `CompanionsActions`
- Produces: `Companions(props: { characterId: string; data: CompanionView[]; actions: CompanionsActions; onClose(): void })`, `memo`.
  - **One fold state** for the whole screen:
    `usePersistedState<Record<string, boolean>>(`ui:${characterId}:companions`, {})`, with the
    defaults from the Global Constraints.
  - **A `memo` `CompanionBlock`** per companion. It gets the companion view and a per-companion
    actions adapter built with `useMemo` over `[actions, id]`, so stepping one companion's HP
    re-renders that block only.
  - **Inside the block:**
    - the heading is `div.sechead-row.companion` with `button.sechead` holding the caret,
      `.nmtxt` and `.ccount` with `formatHitPoints`. Then `.sec-actions` holds `.editcat`,
      labelled `Edit companion <Name>`.
    - a body `.compbody` holding:
      - `VitalTiles` with `labelPrefix={name}`
      - three `.compsub` sub-sections, each with a `button.subtoggle` holding `.caret` and
        `.dlabel`, plus `aria-expanded`
      - `AbilityRow`s with no mark
      - the Stat block `textarea.area`, `rows={8}`, `aria-label={`${name} stat block`}` and the
        placeholder
      - `CounterRow`s with `labelPrefix={name}`, and the Counters sub-heading's `.addmini`
        labelled `Add counter to <Name>`
  - **Dialogs:**
    - **New companion:** after a successful `addCompanion`, write `open[id] = true`.
    - **The Companion dialog:** `NameField`, then two `CheckRow`s each followed by a `div.hint`,
      calling `setCompanionRollsInitiative` / `setCompanionHasHitDices` in `onChange` only. Then
      `ConfirmDelete`.
    - **`HitDiceDialog`**, titled `<Name>: Hit Dices`.
    - **`NewCounterDialog`** and **`EditCounterDialog`**, without categories.
    - A dialog whose companion or counter no longer exists renders nothing.
- **`ICONS.paw`:**
  ```tsx
  paw: (
    <svg viewBox="0 0 24 24">
      <circle cx="6" cy="10" r="2" /><circle cx="9.5" cy="5.5" r="2" />
      <circle cx="14.5" cy="5.5" r="2" /><circle cx="18" cy="10" r="2" />
      <path d="M12 11c-3 0-6 4.5-6 7 0 1.7 1.3 2.5 3 2.5 1.2 0 2-.6 3-.6s1.8.6 3 .6c1.7 0 3-.8 3-2.5 0-2.5-3-7-6-7z" />
    </svg>
  ),
  ```
- **`hubSummary.ts`:**
  - `companions` is `Nothing yet` with no companions.
  - Otherwise it shows the first two as `` `${name} ${formatHitPoints(hp)}` `` joined by `' · '`,
    then `` `${n} more` `` for any beyond two.
- **`styles.css`**, ported from the mockup's `<style>` block with these class names:
  - `.compbody { padding: 0 0 16px }` and `.compbody .tiles { margin-top: 2px }`
  - `.compsub` (flex, space-between, margin-top 12px) and `.compsub .dlabel { margin: 0 }`
  - `.subtoggle` (inline-flex, gap 6px, `min-height: 32px`, no border or background)
  - `.abhead.nomark, .abrow.nomark { grid-template-columns: 44px 1fr 1fr 1fr }`
  - the Stat block's growth: `@supports (field-sizing: content) { .compbody .area { field-sizing: content; min-height: calc(8lh + 18px) } }`
  - `.tile .tval.off { font-family: var(--font-ui); font-size: 14px; font-weight: 600; color: var(--ink-2) }`
  - the sticky heading:
    - `.sv { --svhead-h: 50px }`
    - `.sechead-row.companion { position: sticky; top: var(--svhead-h); z-index: 4; background: var(--paper) }`
    - `.sechead-row.companion .sechead { flex: 1 1 auto; min-height: 40px }`
    - Set `--svhead-h` to `.svhead`'s rendered height, measured in Task 10.
  - `.companion .sechead` gets the tap-area `::after` like `.editcat`.
  - The companion block renders its own `div.abhead.nomark` header row (Ability, Score, Mod,
    Save) above the `AbilityRow`s, so header and rows share the three-box grid.

- [ ] **Step 1: Failing tests in `Companions.test.tsx`.**
  - **Setup:** `renderWith(data, actions)` with `spyActions(noCompanionsActions)`,
    `stubDialogElement()`, and `localStorage.clear()` in `beforeEach`.
  - **Folding and order:**
    - `'shows each companion folded, with its HP in the heading'`: buttons
      `Vestige 9/16` and `Owl 0/1` both have `aria-expanded="false"`.
    - `'opens a companion with its tiles, abilities, stat block and counters in that order'`
    - `'folds two companions with the same name separately'`: two `Skeleton`s, open the first,
      and only the first is expanded. The fold state is keyed by id.
    - `'remembers a fold for the same character only'`, using the remount pattern from
      `CategorizedSection.test.tsx:115-127`.
  - **Creating:** `'opens a companion just created'`. The `addCompanion` spy returns
    `{ ok: true, id: 'new' }`, and the new data includes it, expanded.
  - **The off tiles:** `'shows Uses yours and No hit dices when switched off, with no input or button'`.
  - **The Companion dialog:**
    - `'switches call their setters on change only'`: open the dialog and close it, and neither
      setter is called. Tick `Rolls initiative`, and `setCompanionRollsInitiative('v', true)` is
      called once.
    - `'asks before deleting a companion'`.
  - **Labels and titles:**
    - `'names every control after its companion'`. Labels from the Global Constraints list,
      counters included.
    - `'titles the hit dice dialog with the companion's name'`.
  - **Hub:** `hubSummary.test.ts` gains the cases `Nothing yet`, `Vestige 9/16 +5 · Owl 0/1`, and
    a third companion as `· 1 more`. The `'says so when a section holds nothing'` loop gains
    `'companions'`.
- [ ] **Step 2: Run, and expect failures.**
  - Command: `npx vitest run src/ui/screens/Companions.test.tsx src/ui/screens/hubSummary.test.ts`
  - Expect FAIL.
- [ ] **Step 3: Implement** the screen, the icon, the hub entry, the `CharacterHub` case
      (`characterId={data.character.id}`), the summary, the CSS, and a story with `Populated`
      (both companions) and `Empty`.
- [ ] **Step 4: Run, and expect a pass.**
  - Run `npm test`, `npm run typecheck`, `npm run lint`, `npx prettier --check .`. Expect all
    green.
  - Prove it bites: key the fold state by name, and watch only the same-name test fail. Restore.
- [ ] **Step 5: Commit:** `feat(ui): the companions screen and its hub entry`.

### Task 9: Abilities & Skills blocks fold

**Files:**
- Modify:
  - `src/ui/screens/AbilitiesAndSkills.tsx` (+ test, story)
  - `src/ui/screens/CharacterHub.tsx` (pass `characterId={data.character.id}`)

**Interfaces:**
- Produces: the `AbilitiesAndSkills` props gain `characterId: string`.
  - The headings become `button.sechead` with `.caret`, `.nmtxt` and `aria-expanded`.
  - State: `usePersistedState<Partial<Record<'abilities' | 'skills', boolean>>>(`ui:${characterId}:abilities`, {})`.
    A value means "collapsed"; both start open.
  - A folded block hides its `.abhead` and rows, or its skill rows.

- [ ] **Step 1: Failing tests in `AbilitiesAndSkills.test.tsx`.**
  - `'starts both blocks open'`
  - `'folds Abilities and Skills separately'`
  - `'remembers a fold for the same character only'`, using the remount pattern
  - `'keeps Prof. Bonus, Passive Perc. and Speed outside the folds'`
- [ ] **Step 2: Run, and expect failures.** Command:
      `npx vitest run src/ui/screens/AbilitiesAndSkills.test.tsx`.
- [ ] **Step 3: Implement**, then update the story's args with `characterId: 'story'`.
- [ ] **Step 4: Run** the full checks. Expect all green.
- [ ] **Step 5: Commit:** `feat(ui): the abilities and skills blocks fold`.

### Task 10: Seed, browser checks, record

**Files:**
- Modify:
  - `src/devSeed.ts`
  - `src/ui/styles.css` (the measured `--svhead-h`, if it differs)
  - `AGENTS.md`
  - `docs/BACKLOG.md`
  - the spec (`Status:` and `## 10. Deviations`)

- [ ] **Step 1: Dev seed.** Sable Nightwind gets two companions through the business API.
  - **A Vestige:**
    - HP `4 + 4 × <Sable's seeded Warlock level>` both current and total
    - AC 16 and initiative off
    - hit dice on, d6 × that Warlock level, all unspent
    - abilities `1/-5/-2`, `14/+2/+5`, `10/+0/+3`, `15/+2/+5`, `15/+2/+5`, `16/+3/+6`
    - the stat block text from the mockup
    - a counter `Divine Power` at 1/1
  - **An Owl:**
    - HP 1/1, AC 11, initiative on at +1, hit dice off
    - abilities `3/-4/-4`, `13/+1/+1`, `8/-1/-1`, `2/-4/-4`, `12/+1/+1`, `7/-2/-2`
    - its stat block text from the mockup
- [ ] **Step 2: Browser checks.**
  - **Setup:**
    - In the worktree run `npx vite --port 5299 --strictPort` in the background.
    - Use the Playwright MCP browser at 412×915. It is the owner's window, so restore it to
      `http://localhost:5199/` at 412×915 when done.
    - Clear only `localhost:5299`'s storage.
  - **Checks**, at 320px, 360px and 412px, light and dark, reporting what each printed or
    showed:
    - **Persistence:** create a companion, set its numbers, tick both switches, add a d6, add a
      counter, reload, and everything survives.
    - **Migration:** a v7 document put straight into IndexedDB is listed, opens with no
      companions, and reads back as v8 with `companions` last.
    - **Stat block:** it grows with its text, and the attack line shows without scrolling the
      box.
    - **Sticky heading:** an open companion's heading stays under `Companions` while its body
      scrolls. Measure `.svhead`'s height and set `--svhead-h` to it.
    - **320px stress:** a companion named with 80 characters ellipsises, its pill and ✎ stay
      visible, `Uses yours` and `No hit dices` stay on one line, and `document.documentElement.scrollWidth`
      equals the viewport width.
    - **Abilities & Skills:** both blocks fold, and the fold survives a reload.
- [ ] **Step 3: Record.**
  - **`AGENTS.md`:**
    - a `- **Schema v8: companions** (date)` bullet after the v7 one, in the same structure:
      what v8 adds, the migration and its bait, the UI, and what was verified in Chromium
    - the isolation paragraph's copy history
    - the Map: `v7/` becomes frozen, a `v8/` line is added, and the migration, fixtures,
      business and UI lines gain the new files
    - the test count, from `npx vitest run`'s printed totals
  - **`docs/BACKLOG.md`:** a Done entry in the existing format.
  - **The spec:** set `Status: **built <date>** on branch \`feature/companions\`, from \`docs/superpowers/plans/2026-11-08-companions.md\`.`
    and add `## 10. Deviations`.
- [ ] **Step 4: Run all four checks, then commit:** `docs: record schema v8 and companions`.
