# Pact slots — Design

A warlock's Pact Magic: X spell slots, all of one level Y, kept apart from the ordinary 1st–9th
slot table. The player chooses the level and the number of slots and ticks them off like any
other slot. The app computes none of it (AGENTS.md, "What this is"): the level is not worked out
from a warlock's class level, and nothing refills the slots on a short rest. Needs character
schema v5.

Status: **designed 2026-10-18**, on branch `feature/pact-slots`.

## 1. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Computed or entered | **Entered.** Level and slot count are typed by the player; nothing reads the classes | The app computes nothing, so it never disagrees with a house rule or homebrew |
| How many | **One pact entry per character** | Pact Magic is one feature, even for a multiclassed warlock |
| Level range | **1–9** | The rules stop at 5th, but the app does not enforce rules; 1–9 matches the ordinary slot levels |
| Shape | **Always present**, `{ level, current, total }`; `total: 0` means no pact slots and hides the row | User's decision. The same rule the nine ordinary levels already follow ("0 hides the level"), so there is no `null` branch anywhere |
| Showing or hiding | **Only by whether slots are filled in.** Nothing records "this character is a warlock" | User's decision. The switches in the dialog are dialog state, not document state |
| Switching a kind off | **Zeroes it**: `total` and `current` of that kind go to 0, with no confirmation. The pact level is left as it was | User's decision. A switch then always agrees with what the sheet shows outside the dialog. The level means nothing at `total: 0`, and keeping it pre-fills the next switch-on |
| No slots at all | The Spell Slots part of Counters shows **only a "Set spell slots" button**: no heading, no table, no "No spell slots yet" text | User's decision |
| Where it shows | **First row** of the spell slot table on Counters, and first in the hub summary | User's decision ("at the start of the table") |
| Mystic Arcanum | **Not part of this.** Once per long rest per spell: an ordinary counter covers it | Out of scope |
| Existing characters | Migrate with **no pact slots**: `{ level: 1, current: 0, total: 0 }` | The app writes nothing the player did not do. A "Warlock" class row is not read |

## 2. Schema v5

v4 is frozen: it is on `main` and deployed. `v5/` starts as a literal copy of `v4/` and diverges
only as listed here.

```ts
schemaVersion: 5

counters: {
  categories, uncategorized,           // as in v4
  spellSlots: { '1' … '9': { current, total } },   // as in v4
  pactSlots: {                         // NEW, required key, last in `counters`
    level: integer 1–9,
    current: integer ≥ 0,
    total: integer ≥ 0,
  },
}
```

- **Strict**, like every object schema, with its row in the strict-table test.
- **`level` is stored** because, unlike an ordinary level, it is not the key.
- **No `current ≤ total` rule**, matching the ordinary slots.
- **Blank document**: `pactSlots: { level: 1, current: 0, total: 0 }`. `level: 1` is the one value
  in a blank pact entry that means nothing; it is there because the key is required and has to
  hold a valid level.

## 3. Migration v4 → v5

`migrateV4ToV5` sets `schemaVersion: 5` and adds `counters.pactSlots: { level: 1, current: 0,
total: 0 }`. It reads nothing else: not the classes, not a counter named "Pact Magic". The key
goes last in `counters`, as in a blank v5 document, so a plain spread puts it there (as
`migrateV3ToV4` does). Frozen once released, like every migration.

Registered in `schema/index.ts` (`CURRENT = 5`) and `migration/migrations.ts`, the only two files
outside the version directories that a bump touches.

## 4. Business layer

`src/business/counters.ts`:

```ts
/** A spell slot whose level is stored and chosen by the player, not fixed by its key. */
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

- **A subclass, not a sibling.** It differs from `SpellSlotBO` only in where `level` comes from
  and that it can change. `current`, `setCurrent`, `total` and `setTotal` are inherited, not
  copied, so setting `total` leaves `current` alone, as it does for an ordinary level.
- **`CountersBO.pactSlots`** is a getter returning a `PactSlotsBO`, beside `spellSlots`. The
  name follows the document key, as `HitPointsBO` and `DeathSavesBO` do.
- **No `clear()` and no `clearSpellSlots()`.** The dialog's switches zero a kind through the
  setters that already exist, so neither method would have a caller. This was the user's call.
- **`INVALID_SLOT_LEVEL`**, a new `RuleCode`, is thrown by `setLevel` for anything that is not an
  integer from 1 to 9. One code for every rejected value, as `INVALID_DIE_SIZE` does, because
  `BELOW_ONE` would be false of 10 and `NOT_AN_INTEGER` false of 0.
- **`PactSlotsData`** is added to `types.ts` (`CharacterDocument['counters']['pactSlots']`). It
  stays internal and is never re-exported from `index.ts`. `PactSlotsBO` is exported.

## 5. UI

### Counters screen

```
No slots at all:                With slots:

[ Set spell slots ]             SPELL SLOTS               [Edit]
                                ┌──────────────────────────────┐
COUNTERS …                      │ Pact 3rd      [−] 1 [+] / 2  │
                                │ 1st           [−] 4 [+] / 4  │
                                │ 2nd           [−] 2 [+] / 3  │
                                └──────────────────────────────┘
```

- **"No slots at all"** means no ordinary level has `total > 0` and the pact entry has
  `total: 0`. Only the "Set spell slots" button shows.
- **Otherwise** the "Spell Slots" heading shows with an **Edit** button (today's "Set totals",
  renamed because the dialog now sets a level too). The table lists the pact row first, if its
  `total > 0`, then every ordinary level with `total > 0`, as today.
- **The pact row** is labelled `Pact 3rd` and has the same stepper and `/ total` as an ordinary
  row. Its stepper's accessible label is "Pact slots remaining".

### Spell slots dialog

```
☑ Pact magic
    Level   [ 3rd      ▾]      ← <select>, 1st–9th
    Slots   [  2 ]
☑ Spell slots
    1st level   [ 4 ]
    …
    9th level   [ 0 ]
    0 hides the level.
```

- **Two switches**, each the existing `CheckRow`, pact first to match the table.
- **On when the dialog opens** if that kind is filled in: Pact magic if the pact `total > 0`,
  Spell slots if any ordinary level has `total > 0`. React state, never stored.
- **Switching on** only shows that kind's fields.
- **Switching off** sets that kind's `total` and `current` to 0: the pact entry, or all nine
  ordinary levels. The pact level stays.
- A switch turned on and left at 0 shows nothing once the dialog closes, and is off again the
  next time it opens. That follows from the rule; no extra state keeps it on.
- **The level** is a native `<select>` with `inp`, like the category picker.

### View and actions

- **`CountersView.pactSlots: SpellSlotView`.** The shape is the same `{ level, current, total }`,
  so no new view type is needed.
- **`CountersActions`** gains `setPactSlotLevel(level)`, `setPactSlotCurrent(value)` and
  `setPactSlotTotal(value)`, bound in `bind.ts` to `sheet.counters.pactSlots`.
- **Switching off** calls the existing per-field actions (`setSpellSlotTotal`,
  `setSpellSlotCurrent` and the pact ones). There is no clear action.

### Hub summary

`hubSummary.ts` puts the pact entry first when its `total > 0`: `Pact 3rd 1/2 · 1st 4/4 ·
2nd 2/3 · 2 more`.

## 6. Testing

Every new test is broken on purpose once to prove it bites (AGENTS.md, "Traps").

**Schema `v5/`:**
- the v4 tests, copied
- `pactSlots` rows in the strict table
- level bounds: 0 and 10 rejected, 1 and 9 accepted, 1.5 rejected
- a negative `current` or `total` rejected
- a missing key rejected
- the blank document has `{ level: 1, current: 0, total: 0 }`

**Migration:**
- `v4ToV5.test.ts`, against a new `v4DocFor` fixture, checked against `SCHEMAS[4]` in
  `fixtures.test.ts` like the earlier ones
- the fixture has a "Warlock" class and a counter named "Pact Magic", so a migration that read
  either would be caught
- the real-registry test (`indexedDbRepository.test.ts`) and `codec.test.ts` extended to v5, as
  AGENTS.md requires at every bump

**Business:**
- `PactSlotsBO` getters and setters
- `INVALID_SLOT_LEVEL` for 0, 10 and 2.5
- the inherited `current`/`total` guards (`NEGATIVE`, `NOT_AN_INTEGER`)
- the round-trip test fills `pactSlots` and still satisfies `CURRENT_SCHEMA`

**UI:**
- `Counters.test.tsx` (new; the screen has no tests today):
  - no slots: only the button
  - the pact row comes first
  - switches open according to the data
  - switching off zeroes that kind and leaves the pact level
- `hubSummary.test.ts`: the pact entry first
- `bind.test.tsx`: the three new actions
- the Counters story and `src/ui/fixtures.ts` get a pact entry

**In the browser** (Chromium at 320px and 360px, light and dark):
- set pact slots, tick one off, reload, and both survive
- a stored v4 document opens with no pact row and is written back as v5
- switching a kind off removes its rows
- a character with no slots shows only the button

## 7. Out of scope

Mystic Arcanum, a short-rest refill, deriving the level from warlock levels, and a second pact
entry.
