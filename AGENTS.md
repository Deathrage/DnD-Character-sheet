# Agent guide

Instructions for any AI agent working in this repository. Read this before changing code.

## What this is

A D&D 5e character sheet app. Its defining property is that **it computes nothing**. Every number
is entered by the player — no derived modifiers, no saving throws calculated from ability scores,
no spell-slot tables by class. This is deliberate: it means the app never disagrees with a house
rule, a homebrew feature, or an edition variation.

If you find yourself about to add a calculation, stop. That is a feature request, not a gap.

One character is one versioned JSON document, stored locally in IndexedDB.

**Read next:** `docs/superpowers/specs/2026-07-25-dnd-character-sheet-design.md` is the design spec
and the authority on intent. Section numbers referenced below (§3.4, §11) point at it.

## Current state

The **data-access layer is complete**, and so is the **business object tree** built on top of it.
No UI, no build, no app you can run yet.

- 226 tests across 13 files, `eslint .` and `tsc --noEmit` clean.
- On branch `feature/character-sheet-foundation`, open as PR #1 against `main`. Not merged.
- `main` is still at the initial commit.
- Schema v1 was restructured in place on 2026-09-20 — see `src/data/schema/README.md` for why an
  in-place edit was still safe: nothing built against `v1/` had shipped or stored a real document
  yet, so its freeze had not begun. `classes` is now an array of `{ id, name, level }`, not a
  name-keyed map. `featsAndTraits`, `spellList` and `counters` all share a `Categorized<T>` shape:
  `{ categories: { id, name, items }[], uncategorized: T[] }`. Every collection item — classes,
  categories, feats, spells, counters, inventory items, weapons, other equipment — now carries a
  required uuid `id`, and a document-level check rejects any id reused anywhere in the document
  (`doc.id` is excluded from that check: it is the IndexedDB store key, not a collection member).
  Duplicate _names_ are representable now; rejecting them is the business layer's job, not the
  schema's.
- The storage-layer work the followups doc called the sharpest risk is done: `createIndexedDbRepository`
  takes an injectable `registry` and `openDb`, reports `blocked`, `blocking` and `terminated`
  through an `onFailure` callback, and `list()` awaits `tx.done` so an aborted transaction rejects
  the call instead of surfacing as an unhandled rejection. `save()` now throws a `StorageError`
  (`src/data/repository/storageFailure.ts`) instead of a `CharacterLoadError`.
- The **business object tree** (`src/business/`, 195 tests across 14 files) is done: `CharacterSheetBO`
  composes ten subtree business objects — classes, hit points, hit dice, journal & notes, inventory,
  equipment, feats & traits, spell list, counters, and abilities & skills — over one MobX-observable
  document. That document lives behind a true `#doc` private field, not TypeScript's `private`:
  `private` is erased at compile time, so a cast or plain JavaScript would still reach it, and
  runtime enforcement is the point. There is no accessor anywhere in the tree that hands the
  document back out — `src/business/characterSheet.roundTrip.test.ts` walks every property
  reachable from a `CharacterSheetBO`, including prototype getters, and asserts none of them exposes
  it. `src/business/index.ts` is the only file `src/ui/` may import from this directory; it exports
  the `*BO` classes and their `New*` input types the UI needs to name, and deliberately never the
  `*Data` aliases in `types.ts` — those are the stored shapes, and exporting one would put the
  document's structure back into UI signatures. That same test file also fills every branch of the
  tree and asserts the result still satisfies `CURRENT_SCHEMA`: the property that will let autosave
  validate a document and refuse to save it loudly on failure, rather than ever writing one the
  schema would reject.
- What this plan does not cover, and is not built yet: `CharacterLibraryBO`, `CharacterEntryBO`,
  `CharacterFile`, `StorageBO`, and `Autosave` (spec §5-6). They need `mobx-utils`' `deepObserve`,
  which is a second, separate plan.

What is built: the versioned schema, the migration loop and its error taxonomy, export/import, the
IndexedDB repository, and the business object tree. What is not: the character library, autosave
and storage objects (spec §5-6), and the UI.

## Commands

```
npm test           # vitest run
npm run test:watch
npm run typecheck  # tsc --noEmit
npm run lint       # eslint .
npm run format     # prettier --write .
```

All three of test, typecheck and lint must pass before any commit, and `npx prettier --check .`
should stay green.

`.prettierignore` excludes `docs/`. That is deliberate, not an oversight. **`docs/start/` holds the
original project inputs** — the model sketch, the written brief, and an interactive wireframe
prototype. They are the authority on what was actually asked for, so they stay byte-for-byte as
written; do not reformat, tidy or "correct" them. `docs/superpowers/` holds specs and plans, which
are records of decisions already taken.

Environment: Windows, Node 24. Zod 4.4.3, TypeScript 6, ESLint 10 (flat config), Vite 8, Vitest 4,
`idb` 8, `fake-indexeddb` 6. Several of these are newer majors with breaking changes from the
versions you may have memorised — **verify an API against the installed version rather than
recalling it.** That habit caught three real problems during the initial build.

## The one promise this codebase keeps

**A document that cannot be loaded is never silently repaired, defaulted, or dropped.** It fails
with a typed reason, and the raw JSON is retained so a repair screen can display it.

Almost every rule below exists to protect that. When in doubt about a change, ask whether it could
cause a stored document to be altered, or a failure to be swallowed. If yes, it is wrong.

## Invariants — do not break these

Each of these looks like it could be simplified. Each was arrived at deliberately, and several
were arrived at _after_ getting them wrong once.

### Schema versions are isolated by construction

Each version owns a self-contained directory under `src/data/schema/`. **Nothing is shared between
versions.** `v2/` will begin as a literal copy of `v1/` and diverge.

Do not "DRY this up" by extracting shared primitives or a shared base schema. The duplication _is_
the isolation mechanism. The migration loop validates a document _at its own version_, so a
primitive edited for v2's benefit silently redefines what v1 accepted — tighten a rule and a
legitimately-valid stored character starts reporting `INVALID_AT_VERSION`, blaming the player's
file for your change.

A shipped version is never edited. `src/data/schema/README.md` has the full rules, including when
the freeze begins. Read it before touching anything under a version directory.

### Names are rejected when padded, never trimmed

```ts
export const shortName = z.string().min(1).max(MAX_SHORT_NAME).refine(isTrimmed, NOT_TRIMMED);
```

Do not "simplify" this to `.trim()`. `parseCharacter` returns the _parsed_ value, so trimming on
load would rewrite a stored document — the same silent repair that unknown-key rejection prevents.
Trimming belongs at the write boundary: `createCharacter` and the business layer's name-editing
actions. Internal whitespace is preserved on purpose.

### Every object schema rejects unknown keys

Zod's `.strict()` does **not** propagate into a separate schema instance used as a property value.
It does survive `.extend()` on a strict base. Every object schema in `v1/` is individually strict,
and a table-driven test covers every nested location. If you add a schema, make it strict and add
its table row.

### These specific Zod validators, not the obvious ones

```ts
export const uuid = z.uuidv4();
export const isoDateTime = z.iso.datetime({ precision: 3 });
```

Measured against zod 4.4.3: `z.uuid()` **accepts** a nil UUID and a bad version nibble, and bare
`z.iso.datetime()` **accepts** 0, 1 or 6 fractional digits. Both looser siblings look like harmless
simplifications and both widen what reaches a character file. Tests exist specifically to fail if
someone swaps them.

### `schema/index.ts` is the only entry point outside `schema/`

It exports `CURRENT`, `SCHEMAS`, `CURRENT_SCHEMA`, `CharacterDocument`, and `createCharacter`.

It deliberately does **not** export `ABILITY_KEYS`, `SKILL_KEYS`, `SPELL_SLOT_LEVELS`, or the
version-named schema. Those are facts about one version; exporting them version-neutrally means
every consumer silently switches the day v2 renames a skill. Anything that needs them belongs
inside the version directory — which is why the blank-document factory lives there.

### Layer boundaries are lint-enforced

`ui → business → data → shared`, never upward, and nothing outside `src/data/schema/` may import a
version directory. These are ESLint rules, not conventions. If a rule blocks you, the design is
telling you something; do not add an exception without a reason you would defend.

### IndexedDB uses out-of-line keys

`createObjectStore('characters')` with `put(value, key)` — never a `keyPath`. A `keyPath` reads the
key _from_ the stored value, so a corrupt document would become unlistable and unreachable. A
damaged document must still appear in the list, flagged, and open in a repair screen.

### The test timezone is pinned

`vitest.config.ts` sets `env: { TZ: 'Etc/GMT+5' }`. Do not remove it. Date-boundary tests are
otherwise non-deterministic, and a local-time bug slips through depending on where the machine is.
Note POSIX's inverted sign: `Etc/GMT+5` is **UTC−5**.

## Traps found the hard way

These cost real time. They are not obvious and they do not announce themselves.

**ESLint flat config replaces rather than merges array-valued rule options.** Two config objects
both setting `no-restricted-imports` means the later one wins outright — the earlier restriction
silently disappears with lint still green. This is documented in `eslint.config.js` where the
mistake would be made. The layer boundaries are kept in non-overlapping filesets for this reason.

**A test can pass for the wrong reason, and usually does at first.** Every task in the initial
build produced at least one. Real examples: a fixture that was independently invalid for a second
reason, so the assertion proved nothing; one shared object placed in all nine spell slots and then
mutated by a test, poisoning module state, green only because that test was declared last; coverage
that checked `Object.keys()` and never the values; a record-key test confounded by a field-level
check that rejected the document anyway; a UTC-date test that only discriminated east of UTC.

So: **when you add a test, prove it bites.** Break the thing it guards, watch that test — and only
that test — fail, then restore. Two tests written during the final fix wave shipped vacuous on the
first attempt and were only caught by doing this.

**Verify tooling behaviour against the installed version.** `z.string().uuid()` still exists in Zod
4 despite what you may recall; `z.ZodTypeAny` is deprecated in favour of `z.ZodType`; TypeScript 6
rejects a bare `baseUrl`. Guessing produced wrong code three times during the build.

## Map

```
src/shared/            slug()
src/business/          index.ts is the public face; CharacterSheetBO is the observable root
  characterSheet.ts    id, name, armorClass, the derived `level`, toDocument() (a toJS copy)
  classes.ts           ClassesBO / ClassBO
  hitPoints.ts         HitPointsBO
  hitDices.ts          HitDicesBO / HitDieBO, keyed by die size — no id, the size is the identity
  journalAndNotes.ts   JournalAndNotesBO / JournalDayBO — append or delete-the-newest-day only
  inventory.ts         InventoryBO / CoinsBO / InventoryItemBO
  equipment.ts         EquipmentBO / EquipmentItemBO, plus derived (never stored) attuned/equipped
  categorized.ts       CategorizedBO / CategoryBO / CategorizedItemBO, shared by the three below
  featsAndTraits.ts    FeatBO, over categorized.ts
  spellList.ts         SpellBO, over categorized.ts
  counters.ts          CounterBO / SpellSlotBO, over categorized.ts plus the nine fixed slots
  abilitiesAndSkills.ts AbilityBO / SkillBO, fixed key sets built once in the constructor
  errors.ts            RuleViolation, RuleCode — every rule this layer enforces
  types.ts, nodeBO.ts, namedItem.ts, observableList.ts, mobxConfig.ts, guards.ts, createId.ts
                       internal only; never re-exported from index.ts
src/data/schema/       index.ts is the public face; README.md governs versioning
  v1/                  primitives, document, blank (factory), index — self-contained
src/data/migration/    versionOf, parseCharacter, the LoadError taxonomy
src/data/serialization/ export and import (three-outcome ParseTextResult)
src/data/repository/   the IndexedDB repository, ListEntry, summarize
src/data/characterLifecycle.test.ts   end-to-end across all four modules
src/test/              fake-indexeddb setup
src/test/fixtures.ts   ID_A, ID_B, FIXED_NOW, docFor, wipe, createOpener, putRaw — shared so the
                       data-layer test files stop each defining their own
```

Tests are colocated: `foo.ts` is tested by `foo.test.ts` beside it.

`parseCharacter` takes an optional injectable registry. That is not gratuitous — at v1 the migration
loop body never executes, so without injection every migrating branch would ship untested and first
run years from now against a real character file. The tests build a synthetic three-version world.

## What to do next

Two plans remain, in order:

1. **Business layer** — MobX facades over a plain observable document (so `toJS(doc)` _is_ the saved
   file), the rule-carrying actions, debounced autosave with flush-on-hide, and the persistence
   gate. Spec §6.
2. **UI** — React, the router, `ResponsiveDialog` (bottom sheet on phone, centred modal on desktop),
   the character list, vitals header, hub grid, Feats & Traits, and the raw-JSON editor. Spec §7-8.

`docs/superpowers/plans/2026-07-25-data-layer-followups.md` lists everything found and consciously
deferred, split into what to schedule into the business-layer plan and what to fix opportunistically.
The two items that mattered most — iOS storage-failure handling, which spec §11 calls the sharpest
risk in the design, and making the repository's migration registry injectable — are both done; see
"Current state" above. What is left in that doc is scoped to the business layer: trimming names at
the write boundary, re-exporting `describeLoadError` for `ui` (which may not import `data`
directly), and reading a list row's id from its summary rather than re-deriving it from `doc.id`.

## How to work here

Small commits, Conventional Commit prefixes, tests written before implementation. Do not claim
something works without having run it — say what you ran and what it printed.

If an instruction you are given conflicts with what you find in the code, say so rather than
improvising around it. Several improvements in this codebase came from exactly that.
