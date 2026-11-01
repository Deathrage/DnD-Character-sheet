# Decimal counter steps — Design

A generic counter gets a **step**: the amount its − and + buttons add or take away. The step
may be a fraction — 0.5, 0.25, 0.1 — so a counter can track something that is spent in parts:
hours of lantern oil, days of rations, the charge of a wand that drains by halves, a potion
measured by the dose. Its remaining and total values become fractions too, entered by the
player as they are today. The app computes none of it (AGENTS.md, "What this is"): stepping
is arithmetic the player asked for, not a rule, and nothing ever sets a step for them. Needs
character schema v7.

Status: **built 2026-11-01** on branch `claude/decimal-step-counters-qrw4xr`, from
`docs/superpowers/plans/2026-11-01-decimal-counters.md`.

The request was one sentence ("the generic counters can define a step that can be even decimal,
like for example 0.5 or 0.1"), and this design was made without a live round of questions. Each
decision below marked _assumed_ is the author's reading of that sentence, not the user's choice,
and is the first thing to revisit if the result is not what was meant.

## 1. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Stored as | **`step: number`** on every generic counter, a required key, last | A fact about one counter, kept with it. Required, like v6's `count`: a missing key is rejected, never defaulted |
| Which counters | **Generic counters only.** Spell slots, pact slots, hit dice and death saves stay whole numbers | What was asked for. A spell slot is a slot; half of one is not a thing a sheet shows |
| Precision | **At most 3 decimal places**, for the step and for a counter's remaining and total alike | _Assumed._ 0.5, 0.25 and 0.1 are the asked-for cases; 0.125 costs nothing more. A fourth place is where a float stops reading as a fraction a player typed |
| Range | Step **greater than 0**; remaining and total **0 or more**. All three at most `Number.MAX_SAFE_INTEGER` | A step of 0 is a button that does nothing, and a negative one a − that adds. The upper bound is what `.int()` already enforced on the whole numbers |
| Remaining and total vs the step | **Not tied.** 0.3 remaining with a step of 0.5 is accepted | _Assumed._ A rule would be a rule; the player types what the table says |
| Stepping | − and + add or subtract the step, **rounded to the decimal places of the two operands** | Binary floats: 0.1 + 0.2 is 0.30000000000000004, and a document holding that is one the schema rightly refuses. Rounding to the operands' places gives 0.3 and never invents a place neither had |
| Typing a fraction | `.` **or `,`** as the separator; shown with `.` | _Assumed._ A phone keyboard in `decimal` mode offers the locale's separator, and on a Czech or German phone that is a comma. Refusing it would make the feature untypeable there |
| Where the step is set | **Both counter dialogs**: a Step field beside Total when creating, beside Category when editing | _Assumed._ A step is set once, like a total, so it is not on the row |
| Default step | **1** | What every counter does today |
| Row | `4.5 / 6`, the stepper moving by the step | Same row, fraction or not |
| Existing characters | Migrate with **`step: 1`** | Identical behaviour to before. The app writes nothing the player did not do: a description that says "half hours" is a note |

## 2. Schema v7

v6 is frozen: it is on `main` and deployed. `v7/` starts as a literal copy of `v6/` and diverges
only as listed here.

```ts
schemaVersion: 7

counters.categories[].items[] and counters.uncategorized[]: {
  id, name, description,          // as in v6
  current: decimal ≥ 0,           // CHANGED: was a non-negative integer
  total: decimal ≥ 0,             // CHANGED: was a non-negative integer
  step: decimal > 0,              // NEW, required key, last
}
```

where a _decimal_ is a finite number no greater than `Number.MAX_SAFE_INTEGER` whose shortest
round-trip text (`String(value)`) is digits, optionally followed by a point and one to three
digits. The check is on the text rather than on `value * 1000` because `1.005 * 1000` is
`1004.9999999999999`: the text is what the player typed and what the raw-JSON editor shows.

- **`nonNegativeDecimal`** and **`positiveDecimal`** are new primitives in `v7/primitives.ts`.
  `currentAndTotal` is unchanged and still integer: spell slots, pact slots and hit dice keep
  using it.
- **Every whole number a v6 counter could hold is a valid v7 decimal**, so the migration changes
  no value, only adds the step.
- **Blank document**: unchanged apart from `schemaVersion: 7` — it has no counters.

## 3. Migration v6 → v7

`migrateV6ToV7` sets `schemaVersion: 7` and gives every generic counter — in every category and
in `uncategorized` — `step: 1`, last in the counter, where the business layer puts it on a new
one. It reads nothing else: not the counter's name, not its description. Frozen once released,
like every migration.

Registered in `schema/index.ts` (`CURRENT = 7`) and `migration/migrations.ts`, the only two files
outside the version directories that a bump touches.

## 4. Shared arithmetic

`src/shared/decimal.ts`, with no dependency, usable by every layer:

```ts
export const MAX_DECIMALS = 3;
/** 0 for a whole number; from the shortest round-trip text, as the schema reads it. */
export function decimalPlaces(value: number): number
/** `a + b`, rounded to the more precise of the two, so 0.1 + 0.2 is 0.3 and 4.5 − 0.5 is 4. */
export function addDecimals(a: number, b: number): number
```

The schema does **not** import it: version directories share nothing (`schema/README.md`), so
`v7/` carries its own regex. The business guard and the number field do.

## 5. Business layer

`src/business/guards.ts`:

```ts
/** Finite, within ±MAX_SAFE_INTEGER, at most MAX_DECIMALS places: what the schema stores. */
export function decimal(value: number): number        // NOT_FINITE, UNSAFE_INTEGER, TOO_PRECISE
export function nonNegativeDecimal(value: number): number   // + NEGATIVE
export function positiveDecimal(value: number): number      // + NOT_POSITIVE
```

Three new `RuleCode`s. Each is true of every value it rejects (AGENTS.md's rule): `NOT_FINITE`
of `NaN` and both infinities; `UNSAFE_INTEGER` of 1e17, which is an integer; `TOO_PRECISE` of
1.0001; `NOT_POSITIVE` of 0 and −1. `MAX_DECIMALS` is imported from `shared`, not duplicated:
it is not a fact about a schema version in the way a name limit is, and `shared` is below every
layer.

`src/business/counters.ts`, on `CounterBO`:

```ts
get step(): number
setStep(value: number): void            // positiveDecimal
setCurrent(value: number): void         // now nonNegativeDecimal
setTotal(value: number): void           // now nonNegativeDecimal
```

A new counter is `{ id, name, description, current: 0, total: 0, step: 1 }`. `step` is the last
key, so the raw-JSON editor shows it where the migration puts it.

## 6. UI

### Number field

`NumberField` gains two props:

- **`decimal?: boolean`** — accepts digits with an optional `.` or `,` and one to three places;
  `inputMode="decimal"` so the phone keyboard offers a separator. A field without it is the
  whole-number field it is today, so nothing else on the sheet changes.
- **`step?: number`** — what − and + add or subtract, default 1, applied with `addDecimals`. The
  − button stops at `min`, as it does now.

Half-typed text (`4.`, `4,`, `.5`) stays a draft and never reaches `onChange`, the contract the
field already keeps for whole numbers. `signed` and `decimal` are not combined anywhere.

### Row

```
Lantern oil (hours)        [−] 4.5 [+]  / 6
```

The row's field is `decimal`, with `step={counter.step}`. A counter at step 1 looks and works as
before. The dimming rule, `current <= 0`, is unchanged.

### Dialogs

New counter:

```
Name
[ Lantern oil (hours)        ]
Total          Step
[ 6        ]   [ 0.5      ]
− and + change the count by the step. 0.5 or 0.1 count in parts.
Category
[ Items                    ▾ ]
Note
```

Edit counter:

```
Name
[ Lantern oil (hours)        ]
Remaining      Total
[ 4.5      ]   [ 6        ]
Step           Category
[ 0.5      ]   [ Items  ▾ ]
− and + change the count by the step. 0.5 or 0.1 count in parts.
Note
```

- Step, Total and Remaining are `decimal` fields. Step has `min` of 0.001 (`MIN_STEP`, the
  smallest step three places can express), so a typed 0 never reaches the setter.
- The hint reads the same in both dialogs and sits under the row that holds Step.
- A new counter still starts full (`current = total`), with the step passed to `addCounter`.

### View and actions

- **`CounterView.step: number`**.
- **`CountersActions`** gains `setCounterStep(id, step)`; `addCounter`'s init gains `step`.

### Hub summary

Unchanged: it counts counters, it does not show their values.

## 7. Testing

Every new test is broken on purpose once to prove it bites (AGENTS.md, "Traps").

**Shared:**
- `decimalPlaces`: 0 for 6, 1 for 0.5, 3 for 1.005, 0 for 1e21
- `addDecimals`: 0.1 + 0.2 is exactly 0.3; 4.5 − 0.5 is 4; 1 + 1 is 2; 0.25 + 0.1 is 0.35

**Schema `v7/`:**
- the v6 tests, copied
- a counter's strict-table row covers `step`
- `step`: 1, 0.5, 0.001 and 2.25 accepted; 0, −1, 0.0001, 1.0005, `'1'` and a missing key rejected
- `current` and `total`: 0, 0.5 and 4.125 accepted; −0.5 and 0.0001 rejected
- spell slots and pact slots still reject a fraction
- `blank` has `schemaVersion: 7`

**Migration:**
- `v6ToV7.test.ts`, against a new `v6DocFor` fixture checked against `SCHEMAS[6]` in
  `fixtures.test.ts`
- the fixture has a counter "Lantern oil" described as "Counted in half hours", in a category,
  and the uncategorized "Pact Magic" counter from v4, so a migration that read a description or
  missed one bucket would be caught
- the step is last in every counter; spell slots and pact slots are untouched
- the real-registry test (`indexedDbRepository.test.ts`) and `codec.test.ts` extended to v7

**Business:**
- `decimal`, `nonNegativeDecimal`, `positiveDecimal` and their codes
- `step` defaults to 1; `setStep(0.5)`; `setStep(0)` is `NOT_POSITIVE`; `setCurrent(0.5)`;
  `setCurrent(0.0001)` is `TOO_PRECISE`
- the round-trip test sets a fractional step, remaining and total and still satisfies
  `CURRENT_SCHEMA`

**UI:**
- `NumberField`: a decimal field accepts `4.5` and `4,5` and holds `4.` as a draft; a
  whole-number field still refuses `4.5`; the stepper moves by `step` with no float residue
- `Counters.test.tsx`: the row steps by the counter's step; the Step field in both dialogs;
  Create passes the step
- `bind.test.tsx`: the view's `step` and `setCounterStep`
- the Counters story and `src/ui/fixtures.ts` get a fractional counter; the dev seed gets one

**In the browser** (Chromium at 360px and 320px, light and dark):
- create a counter with step 0.5 and total 6; − three times reads `4.5 / 6`, and that survives a
  reload
- type `0,25` as the step; the stepper moves by 0.25
- a stored v6 document lists undamaged and is written back as v7 with `step: 1` last on every
  counter
- at 320px a row with `4.5` keeps its name readable and nothing scrolls sideways

## 8. Out of scope

A step on spell slots or hit dice; a counter that resets or refills on a rest; a display format
other than the plain number (no `½`, no units).

## 9. Deviations

The build matches this design, with one addition to §6 found in the browser.

- **The row's box grows with its value where the browser supports `field-sizing`.** `.curinp`
  is 40px wide, which holds four characters at its 19px: `9.75` fits, `10.25` needs 43px and
  `12.125` 52px, measured in Chromium. Before v7 a counter showed whole numbers, and four digits
  was plenty. An `@supports (field-sizing: content)` block now sets `width: auto` with a 40px
  minimum, so the box takes the width its value needs in Chromium and Firefox; a fixed `width`
  defeats the property, which is why the base rule keeps 40px for every other browser, where a
  long value scrolls inside the box as it always did. The header's hit-point and hit-die boxes
  stay 40px: they are whole numbers.
