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

**The app runs.** `npm run dev` serves it; every layer is built and wired — schema, migration,
repository, the business object tree, the library/files/storage/autosave layer, the presentational
components, the binding between them, and the shell that composes them.

Verified in a real browser, not only in jsdom: create a character, type an armor class, reload the
page, reopen it, and the value is still there — the whole path from keystroke to IndexedDB and back.
The persistence gate behaves as designed too: headless Chrome refuses `persist()`, the gate moves
to its `refused` phase with the install/export advice, and the session-only dismissal brings it
back on the next load (criterion 14).

- 565 tests across 37 files, `eslint .` and `tsc --noEmit` clean, `vite build` clean.
- `npm run dev` seeds three sample characters **when the store is empty**, via `src/devSeed.ts`.
  It is reached behind `import.meta.env.DEV`, which Vite replaces with a literal `false` in a
  production build, so the module is dead code and never ships — verified by grepping `dist/`.
  It drives the ordinary business API, so it cannot drift into a private definition of what a
  character is. To get the seed back, delete every character, clear the site's storage, or use the
  **Reseed (dev)** button on the character list — also dev-only, also absent from `dist/`.
- **A list row re-summarises itself on every save.** `CharacterSummary` is a snapshot, taken so
  that listing twenty characters does not parse twenty documents — but a snapshot taken when the
  character was created reads "No class · Level 0" forever. `Autosave` therefore reports what it
  stored through `onSaved`, and `CharacterLibraryBO` re-summarises that one row. Without it,
  editing a sheet and going back to the list showed stale values until the next page reload. The
  row is refreshed **in place**, because the raw-JSON screen keys an effect on entry identity.
- **A document that loaded by migrating is written back** at the current version by `get()` and
  `list()`, so it migrates once rather than on every launch. It is replaced only if the row
  still holds exactly what was read (re-checked in the same transaction), so a concurrent
  autosave wins; a failed write-back goes to `onFailure` and never fails the read.
- Developed on `feature/character-sheet-foundation`, merged into `main` as PR #1 on 2026-09-23.
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
- The **business object tree** (`src/business/`) is done: `CharacterSheetBO`
  composes ten subtree business objects — classes, hit points, hit dice, journal & notes, inventory,
  equipment, feats & traits, spell list, counters, and abilities & skills — over one MobX-observable
  document. That document lives behind a true `#doc` private field, not TypeScript's `private`:
  `private` is erased at compile time, so a cast or plain JavaScript would still reach it, and
  runtime enforcement is the point. There is no accessor anywhere in the tree that hands the
  document back out — `src/business/characterSheet.roundTrip.test.ts` walks every property
  reachable from a `CharacterSheetBO`, including prototype getters, and asserts none of them exposes
  it. The same applies one level down: a `CategoryBO` (feats & traits, spell list, and counters are
  all `Categorized<T>`) does not expose its live storage array either. It used to, as a public
  `rawItems` getter meant only for `CategorizedItemBO.moveTo` — but a public getter is public to
  everyone, so any caller holding a category could push a raw, untrimmed, id-less item straight
  into the document. `moveTo` now reaches a category's storage through a module-private `WeakMap`
  declared in `categorized.ts` instead, so nothing outside that one file can reach it. If you add a
  new wrapper that needs to hand a sibling class access to something array-shaped, reach for that
  pattern rather than a public getter "for internal use" — a getter with no access modifier is not
  internal to anyone, TypeScript or otherwise. `src/business/index.ts` is the only file `src/ui/`
  may import from this directory; it exports
  the `*BO` classes and their `New*` input types the UI needs to name, and deliberately never the
  `*Data` aliases in `types.ts` — those are the stored shapes, and exporting one would put the
  document's structure back into UI signatures. That same test file also fills every branch of the
  tree and asserts the result still satisfies `CURRENT_SCHEMA`: the property that will let autosave
  validate a document and refuse to save it loudly on failure, rather than ever writing one the
  schema would reject.
- Three rules the whole-branch review added, worth knowing before you write a setter here:
  - **A business object may not act on a cached sibling array.** `CategoryBO.remove()` rehomes its
    items into `uncategorized`, so an item business object a caller still holds points at an array
    that is no longer part of the document. `CategorizedItemBO` therefore resolves the node's live
    bucket (searching `uncategorized` and every `categories[].items`) before a move or a removal:
    acting on the stale array put the same node in the document twice and made it unsaveable.
    `GONE` when the node is in no bucket, `UNKNOWN_CATEGORY` when the destination category is gone.
  - **Every write the schema length-limits is capped at the setter.** `trimmedName(value, max)` and
    `longText(value)` in `guards.ts` throw `TOO_LONG`; the three limits are duplicated there with a
    comment, for the same reason `SPELL_SLOT_LEVELS` is duplicated in `counters.ts` — `src/business/`
    may not import a schema version directory. 80 for a short name, 40 for a category name, 20 000
    for freeform text.
  - **A rule code must be true of every value it rejects.** `add(0)` threw `NOT_AN_INTEGER` about an
    integer; the die-size guard is now one key-shaped check with its own `INVALID_DIE_SIZE`.
- **Spec §5-6 is now built too**: `CharacterLibraryBO`, `CharacterEntryBO`, `CharacterFile`,
  `Autosave`, and the storage gate. Four decisions there differ from what the spec wrote, each for
  a reason recorded in the file that makes it:
  - **`mobx-utils` was not installed**, and `Autosave` observes with `reaction` over
    `sheet.toDocument()` rather than `deepObserve`. Reading `toJS` of the document inside a
    reaction tracks the whole tree, which is all autosave needs — it discards per-node change
    events anyway. Measured against the installed mobx@7.0.3 before relying on it: 0.59 ms per
    `toDocument()` on a deliberately oversized 124 KB character, and twenty edits in one debounce
    window ran the expression twice, not twenty times.
  - **The debounce is `Autosave`'s own `setTimeout`, not `reaction`'s `delay`.** `delay` schedules
    the effect internally and gives the caller no way to ask for it early, so `flush()` on
    `pagehide` had nothing to flush — and the last edit before the tab goes away is exactly the one
    that must not be lost.
  - **`StorageBO` is `StorageGate`.** The `BO` suffix marks a class that encapsulates a `*Data`,
    which is why `NodeBO<TData>` cannot be constructed without a node. The gate encapsulates a
    browser permission and a transient failure — neither stored, neither a slice of
    `CharacterDocument` — so it is a bare noun like its two neighbours, `Autosave` and
    `CharacterFile`. Bare `Storage` was rejected: it collides with the DOM's `Storage`.
  - **`CharacterEntryBO.open()` returns an `{ ok }` union**, settling spec §10's open item the way
    the list screen wanted, and `entry.repair(text)` — which the spec never specified — is how the
    raw-JSON editor commits a fix. It writes under the entry's own id, so a repair cannot clone the
    character or overwrite a different one.

What is built: the versioned schema, the migration loop and its error taxonomy, export/import, the
IndexedDB repository, the whole business layer, the presentational components, and `src/ui/bind.ts`
binding the two, and the app shell — `src/main.tsx`, `src/ui/route.ts` and `src/ui/App.tsx` —
composing the screens into an application (spec §7-8), with all seven hub sections wired.

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
  errors.ts            RuleViolation, RuleCode — every rule this layer enforces, plus the
                       re-exports `ui` needs but may not import from `data`: describeLoadError,
                       LoadError, StorageFailure
  characterLibrary.ts  CharacterLibraryBO / CharacterEntryBO — the list, create, import, open,
                       repair, clone, remove; attaches Autosave to every sheet it hands out
  characterFile.ts     CharacterFile — a character as text; the document is held in a module
                       WeakMap, never on the class, so `ui` cannot reach it
  autosave.ts          Autosave — reaction, debounce, stamp updatedAt on the copy, save
  storageGate.ts       StorageGate — the persistence gate and the last storage failure
  types.ts, nodeBO.ts, namedItem.ts, observableList.ts, mobxConfig.ts, guards.ts, createId.ts
                       internal only; never re-exported from index.ts
src/ui/                components are presentational: data in, callbacks out, no MobX
  types.ts             the *View and *Actions shapes every component speaks
  reference.ts         D&D facts that are not facts about a character (skill→ability, order)
  bind.ts              THE SEAM: business objects → *View, callbacks → setters, and the four
                       hooks that keep it live. The only file in src/ui that imports mobx
  App.tsx              the shell: route → screen, and the browser affordances no business object
                       can own — file download, file picking, the open sheet's lifetime
  route.ts             hash routing, hand-rolled; three routes, no dependency
  UpdatePrompt.tsx     "a new version is ready": saves pending edits, then lets the new service
                       worker take over. Rendered from main.tsx so App never imports virtual:pwa-*
  components/, screens/   the wireframe's screens; fixtures.ts feeds the stories
src/main.tsx           the composition root; the only place the real library is constructed
index.html             the app document; vite.config.ts builds and tests it
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

Nothing is half-built. What is left is polish and things deliberately never in scope. Feature ideas
live in `docs/BACKLOG.md` — add new ones there, not here:

- **The service worker is `vite-plugin-pwa`, with `registerType: 'prompt'`.** The installed app
  starts offline; verified in Chromium by cutting the network and reloading. The manifest stays
  hand-written in `public/` (`manifest: false`). A new version waits until the player clicks
  Reload in `UpdatePrompt`, which awaits `library.flush()` first — verified by editing a field
  and clicking Reload inside the debounce window: the edit survived. `.storybook/main.ts` strips
  the plugin, because under Storybook it tries to precache Storybook's own bundles and fails.
  Updates are only checked for on launch or reload; there is no periodic check.
- **Hosted on Firebase Hosting**, chosen over GitHub Pages and Azure for the backlog's online
  features: same-origin Auth, and Storage behind Security Rules with no backend of our own.
  `.github/workflows/deploy.yml` deploys `main` live and each PR to a preview channel, to project
  `dnd-character-sheet-64a24` — so the origin is `dnd-character-sheet-64a24.web.app`. Re-running
  `firebase init hosting:github` writes two more workflows that would deploy twice; delete them.
  **The origin
  is permanent**: IndexedDB belongs to it, so moving the app to another address strands every
  player's characters behind export/import. `<id>.web.app` and `<id>.firebaseapp.com` are two
  origins; share only one. The local emulator ignores `firebase.json` `headers`, so check them
  with `curl -I` against a real deploy.
- **Chrome will usually refuse `persist()` anyway.** Verified against Chrome 153 on localhost: it
  returns false with no prompt and no exception, because Chrome grants persistence only to origins
  it considers important — installed, or with accrued site engagement. Granting notification
  permission did not move it. So the refused phase is the normal first-run experience, the gate is
  working when it shows it, and the session dismissal is the everyday path. Do not go looking for a
  bug in `StorageGate` when this happens.
- **Undo and revision history** are out of scope by decision (spec §6), not forgotten. Both stay
  cheap to add against a single-document model.
- **`equipment.weapons` and `equipment.other` have no `moveTo` between them** (spec §10). Add it
  as `NamedItemBO.moveTo` with a different target type if moving a weapon to "other" is ever
  wanted.
- The screens are the wireframe's. They have never been reviewed on a real phone, only in
  Storybook's viewport toolbar.
- **The character list has no order.** `repository.list()` walks an IndexedDB cursor, which is
  key order — and the key is a uuid, so the list is effectively shuffled. Sorting by `updatedAt`
  descending ("most recently played first") is the obvious fix and belongs in `list()` or in
  `CharacterLibraryBO.load()`; it is left undone because it is a product call, not a bug.

`docs/superpowers/plans/2026-07-25-data-layer-followups.md` is now fully discharged. Its two
sharpest items — iOS storage-failure handling (spec §11 calls it the biggest risk in the design)
and the injectable migration registry — were done earlier; the last three, trimming names at the
write boundary, re-exporting `describeLoadError` for `ui`, and reading a list row's id from its
summary rather than re-deriving it from `doc.id`, are done now. Read it for context, not for work.

## How to work here

Small commits, Conventional Commit prefixes, tests written before implementation. Do not claim
something works without having run it — say what you ran and what it printed.

If an instruction you are given conflicts with what you find in the code, say so rather than
improvising around it. Several improvements in this codebase came from exactly that.
