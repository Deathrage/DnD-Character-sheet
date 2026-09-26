# Agent guide

Instructions for any AI agent working in this repository. Read this before changing code.

## What this is

A D&D 5e character sheet app. Its defining property is that **it computes nothing**. Every number
is entered by the player — no derived modifiers, no saving throws calculated from ability scores,
no spell-slot tables by class. This is deliberate: it means the app never disagrees with a house
rule, a homebrew feature, or an edition variation.

If you find yourself about to add a calculation, stop. That is a feature request, not a gap.

One character is one versioned JSON document, stored locally in IndexedDB. Its portrait, if any,
is stored beside it, keyed by the same id.

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

- 1252 tests across 71 files, `eslint .` and `tsc --noEmit` clean, `vite build` clean. `npm run test:rules` adds 12 more, against the Firestore emulator and the real `firestore.rules`.
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
- **Portraits live beside the document, never in it** (2026-09-24). The character schema was still
  v1 then. A portrait is its own IndexedDB store, `portraits`, keyed by character id — IndexedDB
  version 2 added it; see "IndexedDB versioning" below. It was briefly a field in an uncommitted v2
  schema draft — unrelated to the v2 that shipped on 2026-09-26 — never committed or deployed, and moved out because a 20 KB base64 string was four fifths of the
  raw-JSON editor. The split also mirrors the planned Firestore layout (see the sync entry in
  `docs/BACKLOG.md`).
  - **The rule** is `src/data/repository/portrait.ts`: a base64 JPEG data URL, at most 32 000
    characters (~23 KB). Outside the schema version directories because it is not versioned with
    the document — but exported files carry it, so it may only ever widen.
  - **Exported files are `{ sheet, portrait }`**, `portrait` always present, `null` when there is
    none. Import also reads a bare document — every file exported before this — and tells the two
    apart by the `sheet` key, which a strict document can never have. The raw-JSON editor edits
    `sheet` alone, and `parseInto` deliberately refuses the envelope.
  - **Written on its own path.** `Autosave` saves a portrait change at once through
    `savePortrait`, never inside a document save; `flush()` awaits it. Import and clone write both
    stores in one transaction (`save(doc, portrait)`); `delete` removes both.
  - **Compressed in the browser** by `src/ui/portrait.ts` — centre-cropped to 384px, JPEG on a
    white background, quality stepped down to fit 24 000 characters (~17 KB); even pure random
    noise fits. Tight because cloud sync will be Firestore-only (Cloud Storage is not on the Spark
    plan), and Spark caps total stored bytes. **JPEG only, on purpose**: Safari's canvas cannot
    encode WebP, so allowing WebP would make a portrait's format depend on which browser made it,
    and the fix — a WASM libwebp — is a large dependency for a 384px image. SVG is refused too,
    because it can carry script.
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
- **Schema v2: attack rolls and spellcasting** (2026-09-26). The first real version bump;
  `docs/superpowers/specs/2026-09-26-attack-rolls-design.md` is the design and
  `docs/superpowers/plans/2026-09-26-attack-rolls.md` the plan it was built from.
  - **What v2 adds.** `equipment.weapons[].attack` is `{ ability, attackBonus, damage } | null`,
    and `spellList.spellcasting` is a partial record keyed by ability, each entry
    `{ attackBonus, saveDc }`. Everything is entered by the player; nothing is computed. Ability
    keys are the full names (`dexterity`), and `STR`…`CHA` are UI labels only.
  - **Ability first.** Nothing numeric exists without its ability: choosing a weapon's first
    ability creates the attack at `+0` with no damage, changing it keeps both, and clearing it
    clears the attack (`NO_ATTACK` guards the rest). A spellcasting entry is added with its
    numbers in one call, and a second entry for the same ability is `DUPLICATE_SPELLCASTING`.
  - **v1 is frozen now.** It has shipped and real documents exist
    (`testAssets/zahir-ibn-talaar-2026-09-24.json` is one). `migrateV1ToV2` gives every weapon
    `attack: null` and the spell list `spellcasting: {}`, and reads no description: "Damage: 1d8
    Slashing" is the player's note, not data. **A migration is frozen once released**, like the
    schema it produces, because cloud versions are never rewritten and an old backup goes through
    it on every restore.
  - **Tests need a v1 fixture.** `docFor` builds the current version, so `src/test/fixtures.ts`
    has `v1DocFor`, a hand-written v1 literal that `fixtures.test.ts` checks against
    `SCHEMAS[1]`. The repository's migration tests used `docFor` as their "v1" document and
    passed vacuously once it built v2 — worth remembering at the next bump.
  - **UI.** Spellcasting is a row of chips above the spell categories, wrapping rather than
    scrolling. A weapon row shows `DEX +6` on the right and the damage at the head of the
    preview. Damage commits on blur (`NameField`), never per keystroke, because the setter trims.
    Mockups: `docs/superpowers/specs/2026-09-26-attack-rolls-mockups/`.
- **Schema v3: the initiative bonus** (2026-09-26). v2 had been deployed that morning, so it was
  frozen, and one new field still meant a whole new version.
  - **What v3 adds.** `abilitiesAndSkills.initiative`, a signed integer beside `speed`. The player
    enters it. It is never taken from the Dexterity modifier, which Alert, Jack of All Trades or
    a magic item would make wrong.
  - **`migrateV2ToV3`** gives it `0`, the value every untouched number on a sheet already has,
    and reads nothing else. It rebuilds `abilitiesAndSkills` so `initiative` lands after `speed`,
    as in a blank document. Otherwise the raw-JSON editor would show it after all eighteen skills.
  - **Tests.** `src/test/fixtures.ts` gains `v2DocFor`, a v2 document whose v2 fields are filled
    in. Its Dexterity modifier is +3, so a migration that derived initiative would read 3 where
    0 belongs. The `parseCharacter` test in each migration's own file checks that its step ran,
    not where the chain ends. At this bump `v1ToV2.test.ts` compared against `migrateV1ToV2`'s
    output, which was one step short of current once v3 existed. The repository's real-registry
    test and the codec test pin the whole chain, and must be extended at every bump.
  - **UI.** A signed **Init** tile in the header, beside AC, is the only place initiative is shown
    or edited, although it is stored under `abilitiesAndSkills`. Both choices are the user's: the
    Init tile replaced the header's Speed tile, and Abilities & Skills does not show initiative.
    Speed is now edited on Abilities & Skills only, and the header's second row is back to
    `2fr 1fr 1fr`. The hit dice summary joins each die with a no-break space, so a narrow tile
    wraps between dice and never splits `3/5 d8`.
  - **Verified in Chromium** at 360px and 412px:
    - an initiative typed in the header survives a reload
    - a speed typed on Abilities & Skills survives a reload
    - a stored v2 document opens at +0 and is written back as v3, with `initiative` after `speed`
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
- **Cloud backup** (2026-09-24): Google sign-in, dated versions in Firestore — upload, list,
  restore, delete. `docs/superpowers/specs/2026-09-24-cloud-backup-design.md` is the original
  design; §12 there records what was decided during that build. **Cloud quota and layout
  versioning** (2026-09-25) rebuilt the storage layer onto one document per player before any real
  backup existed — `docs/superpowers/specs/2026-09-25-cloud-quota-design.md` supersedes its §3–§5
  and amends §6–§11; §13 there records this build's deviations.
  - **One document per player, `cloud/{uid}`, layout 2.** Its 1 MiB document limit — Firestore's
    own document-size cap — is the quota: nothing a client sends can escape it. The cloud screen
    shows usage stacked, the value over "of 1.0 MB" beneath it, computed by
    `src/data/remote/size.ts`, which `npm run test:rules` checks agrees with the emulator at the
    limit, one byte at a time.
  - **Layout versioning.** `src/data/remote/layout/` is versioned like `src/data/schema/`: one
    strict file per version (`v2.ts` today), `index.ts` the only way in (lint-enforced), parsed by
    the same generic `parseVersioned` walk (`src/data/migration/versioned.ts`) that
    `parseCharacter` is now a thin wrapper over.
  - **Uploads never write an empty map.** Merging `portraits: {}` wipes every stored portrait —
    checked against the emulator — so an upload without a portrait omits the key entirely rather
    than sending `{}`.
  - **`npm run test:rules`.** Runs `src/data/remote/cloudStore.emulator.test.ts` (12 tests) against
    the real `firestore.rules`, on its own port 8181 (`firebase.test.json`) so it never collides
    with `dev:cloud`'s 8080/9099, and in CI (`deploy.yml`, before any deploy). On
    Windows, `emulators:exec` can leave a `java` process listening on 8181 after a run; stop only
    that process (confirm it is `java` first) if the next run says the port is taken — 8080 and
    9099 belong to `dev:cloud` and must never be touched by this.
  - **Still to do by hand after the first deploy:** delete the `users` collection (layout 1) in the
    console — old builds already get `permission-denied` from the new rules, so this is safe
    whenever it happens — and check that the index overrides in `firestore.indexes.json` deployed.
  - **`src/data/remote/` is the only importer of `firebase`**, excluding `src/data/remote/layout/`
    (both lint-enforced). Everything above it speaks `CloudRepository`, so `CloudBackup` and its
    tests never see the SDK.
  - **The service worker's precache denylists `/^\/__\//`.** `/__/auth/handler` is Firebase
    Hosting's reserved path for the redirect sign-in, and it must reach the network, never the
    cached app shell.
  - **Sign-in is a popup in dev, a redirect in production** (`import.meta.env.DEV`). A popup is
    fine on localhost; the spec picked redirect for the deployed app because popups are unreliable
    in an installed PWA and on iOS.
  - **Dev never touches the live project.** Under `import.meta.env.DEV` the repository connects to
    the local Auth (9099) and Firestore (8080) emulators, so a test upload cannot land beside real
    backups. `npm run dev:cloud` starts both (Java required), seeds them with
    `scripts/seedEmulator.mjs`, and runs Vite. The emulator UI is at http://127.0.0.1:4000.
    - The seed is one Google account, **Dev Player** (`dev.player@example.com`), offered by the
      emulator's sign-in popup, whose cloud holds Zahir ibn Talaar in two versions. Nothing
      persists: every run starts from the seed.
    - The emulators enforce the real `firestore.rules`; the seed writes past them with the
      emulator's `Bearer owner` admin token, which the app never sends.
    - Plain `npm run dev` still works without Java; cloud actions then answer "could not be
      reached", because nothing is listening on the emulator ports.
    - Verified 2026-09-25 in Chromium against layout 2 (emulators on spare ports):
      - sign in as Dev Player from the menu; the list and "39.3 KB / of 1.0 MB" show
      - restore with no dialog, restore again with Replace / Keep both, and a restored copy keeps
        its portrait
      - two uploads with one portrait store it once (6,178 bytes), both versions pointing at it
      - deleting one of them keeps the portrait, deleting the other removes it, and Delete all
        empties the cloud
      - a signed-out `#/cloud` lands on the character list
        Another account's access is covered by `npm run test:rules`, against the real rules.
    - **A nearly full cloud is slow to open on a phone.** Measured 2026-09-25 with 50 versions
      (980 KB), from pressing Manage cloud to a full list, in the dev build:
      - desktop: about 0.3 s
      - 4× CPU throttle: 3.1–3.6 s
      - 6× CPU throttle: 7.3 s
        With 2 versions the same steps take 0.3 s and 0.6 s, so decoding 48 sheets (gunzip, parse,
        validate) costs about 3 s on a mid-range phone. Not optimised yet. Candidates:
      - decode in a Web Worker, which keeps the page responsive but no faster
      - render versions as they decode instead of all at once
      - summarise from the raw JSON and validate in full only on restore, which would change
        when a damaged sheet is flagged (spec §4)
  - **The Firebase chunk is dynamic** (`import()`, never on launch): `firestoreRepository-*.js` is
    196.63 kB (58.94 kB gzip), split out of a main bundle of 465.04 kB (134.74 kB gzip) — from
    `npm run build`; re-run it if these drift.
  - **Project setup** (done 2026-09-25; the list is what a fresh project would need):
    - Firestore database `(default)` in **production mode** — test mode's default rules open
      every document to anyone for 30 days — at a permanent location. Rules are deployed by CI.
    - Authentication → Sign-in method → Google enabled. Authorized domains: the `web.app` and
      `firebaseapp.com` origins only. `localhost` is not needed — dev signs in against the Auth
      emulator, which ignores the list.
    - **The OAuth client must list the `web.app` handler by hand.** Enabling Google creates
      "Web client (auto created by Google Service)" with only the `firebaseapp.com` origin and
      handler. Because `authDomain` is `web.app` (same-origin redirect), Google Cloud →
      Credentials → that client needs origin `https://dnd-character-sheet-64a24.web.app` and
      redirect URI `https://dnd-character-sheet-64a24.web.app/__/auth/handler`; without them
      sign-in fails with `Error 400: redirect_uri_mismatch`.
    - IAM → the GitHub deploy service account (`github-action-…`) holds **Firebase Rules Admin**
      beside Firebase Hosting Admin, or CI's rules step fails with `firebaserules … 403`. A new
      grant took a few minutes to take effect. Deploying `firestore:indexes` (added 2026-09-25) may
      also need **Cloud Datastore Index Admin** — `deploy.yml`'s own comment flags this; the first
      failing run will say so.
    - Still to verify by hand: the live round-trip on `dnd-character-sheet-64a24.web.app` — the
      production redirect sign-in is the one path the emulators cannot cover.

What is built: the versioned schema, the migration loop and its error taxonomy, export/import, the
IndexedDB repository, the whole business layer, the presentational components, and `src/ui/bind.ts`
binding the two, and the app shell — `src/main.tsx`, `src/ui/route.ts` and `src/ui/App.tsx` —
composing the screens into an application (spec §7-8), with all seven hub sections wired.

## Commands

```
npm test           # vitest run
npm run test:watch
npm run test:rules # firestore.rules against the emulator, port 8181 — see "Cloud backup" above
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
versions.** `v2/` began as a literal copy of `v1/` and diverged (2026-09-26), and `v3/` began as a
copy of `v2/` the same day.

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
damaged document must still appear in the list, flagged, and open in a repair screen. The
`portraits` store follows the same rule.

### IndexedDB versioning is not schema versioning

`DB_VERSION` versions the database's _structure_ — its stores and indexes. The character schema
is versioned per document (`schemaVersion`) and migrated when read. Never tie the two: an older
build cannot open a database with a higher version at all (`VersionError`), a bump needs every
other tab's connection closed, and migrating documents inside `upgrade` would force a choice
between aborting the whole upgrade for one bad document and silently dropping it. Bump
`DB_VERSION` only to add or change a store or index, and add one `if (oldVersion < N)` step to
`upgradeCharacterDb` per version, so a browser that skipped a release runs every step it missed.

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
src/shared/            slug(), formatBytes() — decimal units, shared by the quota message and the
                       cloud screen's usage line
src/business/          index.ts is the public face; CharacterSheetBO is the observable root
  characterSheet.ts    id, name, armorClass, the derived `level`, toDocument() (a toJS copy)
  classes.ts           ClassesBO / ClassBO
  hitPoints.ts         HitPointsBO
  hitDices.ts          HitDicesBO / HitDieBO, keyed by die size — no id, the size is the identity
  journalAndNotes.ts   JournalAndNotesBO / JournalDayBO — append or delete-the-newest-day only
  inventory.ts         InventoryBO / CoinsBO / InventoryItemBO
  equipment.ts         EquipmentBO / EquipmentItemBO / WeaponBO (the attack roll, ability first),
                       plus derived (never stored) attuned/equipped
  categorized.ts       CategorizedBO / CategoryBO / CategorizedItemBO, shared by the three below
  featsAndTraits.ts    FeatBO, over categorized.ts
  spellList.ts         SpellListBO / SpellBO, over categorized.ts plus spellcasting
  spellcasting.ts      SpellcastingBO / SpellcastingEntryBO, keyed by ability — no id, like hit dice
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
  cloudBackup.ts       CloudBackup — a sibling of StorageGate; Google sign-in and dated versions
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
  components/, screens/   the wireframe's screens; fixtures.ts feeds the stories. AbilityPicker is
                       the one row of ability buttons both attack dialogs share
src/main.tsx           the composition root; the only place the real library is constructed
index.html             the app document; vite.config.ts builds and tests it
src/data/schema/       index.ts is the public face; README.md governs versioning
  v1/                  frozen: primitives, document, blank (factory), index — self-contained
  v2/                  frozen: v1 plus weapon attacks and spellcasting
  v3/                  current: v2 plus the initiative bonus; blank lives here now
src/data/migration/    versionOf, versioned.ts (parseVersioned, the generic validate-migrate walk
                       shared by `schemaVersion` and `layoutVersion`), parseCharacter (now a thin
                       wrapper over it), the LoadError taxonomy, v1ToV2.ts and v2ToV3.ts (the
                       migrations, registered in migrations.ts)
src/data/serialization/ export and import (three-outcome ParseTextResult)
src/data/repository/   the IndexedDB repository (characters + portraits stores), ListEntry, summarize,
                       portrait.ts — the portrait rule
src/data/remote/       types.ts (CloudRepository and its shapes), codec.ts, cloudError.ts, config.ts,
                       size.ts (Firestore's document-size rules, no dependency), cloudDocument.ts
                       (withVersion, withoutVersions, cloudDocumentSize — the document after an
                       upload or a delete, shared by the store and its tests), cloudStore.ts (+
                       cloudStore.emulator.test.ts, run by `test:rules`), firestoreRepository.ts —
                       the only importer of `firebase` (lint-enforced), excluding `layout/`
  layout/              layout 2's schema (v2.ts, one strict file per version like schema/v1/) and
                       index.ts — the only entry point (lint-enforced), parsed by parseVersioned
src/data/characterLifecycle.test.ts   end-to-end across all four modules
src/test/              fake-indexeddb setup
src/test/fixtures.ts   ID_A, ID_B, FIXED_NOW, docFor, v1DocFor, v2DocFor, wipe, createOpener,
                       putRaw — shared so the data-layer test files stop each defining their own
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
  `.github/workflows/deploy.yml` runs only on pushes to `main`, never on PRs, and deploys it live — no preview channels — to project
  `dnd-character-sheet-64a24` — so the origin is `dnd-character-sheet-64a24.web.app`. It deploys in three steps, in this order: `firestore:rules`, then hosting, then
  `firestore:indexes`. Rules go first because the new client works only against the new rules;
  indexes go last and apart because nothing needs them to be correct, so a missing IAM role there
  fails the run without leaving the live app broken. Re-running
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
  Storybook's viewport toolbar — except once, which is how this was found: `viewport-fit=cover`
  lets Chrome on Android draw the installed app under the system navigation bar, so `100dvh`
  reaches under it and the list's add button was half hidden. Seen on a phone with three-button
  navigation, and only after a reload (pull-to-refresh, or Reload in the update strip) — a fresh
  launch was fine. `#root` and the bottom sheet pad by
  `env(safe-area-inset-*)`; anything else anchored to the bottom edge must too. Chromium can
  simulate it: CDP `Emulation.setSafeAreaInsetsOverride` with `{ insets: { bottom: 48 } }`.
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
