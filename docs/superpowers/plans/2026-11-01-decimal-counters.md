# Decimal Counter Steps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A generic counter carries a `step` (a positive decimal of at most three places, default
1) that its − and + buttons move by; its remaining and total become decimals of the same
precision. Stored in character schema v7, migrated from v6 with `step: 1`.

**Architecture:** A new frozen-on-release schema directory `src/data/schema/v7/` (copy of `v6/`)
loosens a counter's `current` and `total` to `nonNegativeDecimal` and adds `step: positiveDecimal`;
`migrateV6ToV7` gives every counter `step: 1`. `src/shared/decimal.ts` holds the rounding
arithmetic every layer above shares. `CounterBO` gains `step` / `setStep` over new decimal guards.
`bind.ts` maps them onto `CounterView.step` and `setCounterStep`; `NumberField` learns `decimal`
and `step`; `Counters.tsx` adds a Step field to both dialogs.

**Tech Stack:** TypeScript 6, Zod 4.4.3, MobX 7, React, Vitest 4 + Testing Library, ESLint 10.

**Spec:** `docs/superpowers/specs/2026-11-01-decimal-counters-design.md`

## Global Constraints

- The app computes nothing: no step is ever read from a name or description; stepping is the
  player's own press.
- `src/data/schema/v6/` and every older version directory are frozen: never edit them.
- A released migration is frozen; `migrateV6ToV7` reads nothing but the counters it extends.
- Every object schema is `.strict()`; `step` is a **required** key, last in the counter.
- Version directories share nothing: `v7/` has its own decimal regex, not an import from `shared`.
- Only generic counters. Spell slots, pact slots, hit dice and death saves stay integers.
- At most 3 decimal places, for step, current and total; step > 0; nothing above
  `Number.MAX_SAFE_INTEGER`.
- The stepper rounds with `addDecimals`: no `0.30000000000000004` ever reaches a setter.
- Before every commit: `npm test`, `npm run typecheck`, `npm run lint`, `npx prettier --check .`.
- Every new test is broken once on purpose to prove it bites, then restored.
- Commit messages: Conventional Commit prefixes, ending with the session's attribution lines.

---

## File map

| File | Change |
|---|---|
| `src/shared/decimal.ts` (+ test) | Create: `MAX_DECIMALS`, `MIN_STEP`, `decimalPlaces`, `addDecimals` |
| `src/data/schema/v7/*` | Create: copy of `v6/`, renamed, decimal counters with `step` |
| `src/data/schema/index.ts` | `CURRENT = 7`, `SCHEMAS[7]`, aliases to v7 |
| `src/data/migration/v6ToV7.ts` (+ test) | Create: the migration |
| `src/data/migration/migrations.ts` | Register `[6, migrateV6ToV7]` |
| `src/test/fixtures.ts`, `fixtures.test.ts` | `v6DocFor` with the bait |
| `src/data/remote/codec.test.ts`, `src/data/repository/indexedDbRepository.test.ts` | Extend the pinned chain to v7 |
| `src/business/errors.ts` | `NOT_FINITE`, `TOO_PRECISE`, `NOT_POSITIVE` |
| `src/business/guards.ts` (+ test) | `decimal`, `nonNegativeDecimal`, `positiveDecimal` |
| `src/business/counters.ts` (+ test) | `step`, `setStep`; decimal `setCurrent` / `setTotal` |
| `src/business/characterSheet.roundTrip.test.ts` | Fill a fractional counter |
| `src/ui/types.ts` | `CounterView.step`, `setCounterStep`, `addCounter` step |
| `src/ui/bind.ts` (+ `bind.test.tsx`) | Map them |
| `src/ui/components/NumberField.tsx` (+ test) | `decimal`, `step` |
| `src/ui/fixtures.ts` | `step` on every counter; a fractional one; `noCountersActions` entry |
| `src/ui/screens/Counters.tsx` (+ test) | Row steps by the step; Step field in both dialogs |
| `src/devSeed.ts` | A fractional counter |
| `AGENTS.md`, `docs/BACKLOG.md`, the spec | Record v7 |

---

### Task 1: Shared decimal arithmetic

- [ ] Tests in `src/shared/decimal.test.ts`: `decimalPlaces` of 6, 0.5, 1.005, 1e21, 1e-7;
      `addDecimals(0.1, 0.2) === 0.3`, `addDecimals(4.5, -0.5) === 4`, `addDecimals(0.25, 0.1) === 0.35`,
      `addDecimals(1, 1) === 2`.
- [ ] Implement `src/shared/decimal.ts`.

### Task 2: Schema v7

- [ ] Copy `v6/` to `v7/`, rename identifiers and comments, bump the literal.
- [ ] Failing tests in `document.test.ts`: `step` required; accepted and rejected values for
      `step`, `current`, `total`; slots still integer; strict-table row.
- [ ] Implement `nonNegativeDecimal`, `positiveDecimal` in `primitives.ts` (+ tests) and the
      counter item in `document.ts`.
- [ ] Register in `schema/index.ts`.

### Task 3: Migration v6 → v7

- [ ] `v6DocFor` in `src/test/fixtures.ts` (+ `fixtures.test.ts` row) with the bait.
- [ ] Failing tests in `v6ToV7.test.ts`; implement `v6ToV7.ts`; register in `migrations.ts`.
- [ ] Extend the pinned chain in `codec.test.ts` and `indexedDbRepository.test.ts`.

### Task 4: Business layer

- [ ] Guards and codes, with tests.
- [ ] `CounterBO.step` / `setStep`, decimal `setCurrent` / `setTotal`, with tests.
- [ ] Round-trip test fills a fractional counter.

### Task 5: UI

- [ ] `NumberField` `decimal` and `step`, with tests.
- [ ] `types.ts`, `bind.ts`, `bind.test.tsx`, `fixtures.ts`.
- [ ] `Counters.tsx` row and dialogs, with tests; the story and the dev seed.

### Task 6: Verify in Chromium, record, commit

- [ ] The browser checks in spec §7.
- [ ] `AGENTS.md` "Schema v7" entry, `docs/BACKLOG.md` Done entry, spec status line.
