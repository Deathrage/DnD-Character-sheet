# Data layer — deferred items

Carried out of the data-layer plan's review cycle. Everything here was found by a review, judged
deliberately, and left undone. Recorded because the working ledger it came from is scratch and does
not survive; git history is the record from here.

Nothing below blocks merge. The list exists so these get scheduled rather than quietly forgotten.

## Schedule into the business-layer plan

**Storage-level failure handling.** `createIndexedDbRepository` declares no `blocked`, `blocking` or
`terminated` callbacks, so in an installed PWA a second tab holding a connection would block a
future version bump indefinitely. Quota-exceeded and IndexedDB-unavailable (private browsing)
propagate as raw `DOMException`s from `save()`. `list()` never awaits `tx.done`, so a transaction
abort with no in-flight request surfaces as an unhandled rejection rather than a rejected `list()`.
This is real user-visible behaviour on the platform the spec's §11 calls the sharpest risk in the
design, so it should be a planned item rather than a deferred minor.

**An injectable `MigrationRegistry` on the repository.** `parseCharacter` takes one specifically so
migration is testable, but `indexedDbRepository` hardcodes the default. Spec §9 lists "loading a
document written by an older schema" as repository coverage, and it cannot be written today. Pairs
with the `openDb` note below — both are the same question about how the repository is made testable.

**Trim at the write boundary.** The schema rejects padded names rather than trimming them, because
trimming on load would silently rewrite a stored document. `createCharacter` trims its input; every
business-layer action that writes a name must do the same.

**`describeLoadError` reachability.** It is the layer's user-facing copy and lives in `data`, which
`ui` may not import. The business layer will need to re-export it.

**Take the row id from the summary.** `list()` now identifies rows by the store key, but `get()`
still returns a document whose internal `id` could diverge from its key. UI code must use
`summary.id`, never re-derive it from `doc.id`.

## Worth doing when the code is next touched

- **`openDb` is exported production surface** existing only as a test seam for `putRaw`. A consumer
  importing it can write straight past `save()`'s validation guarantee.
- **`toSchemaIssues` takes a `z.ZodError` parameter** and is exported from the same module the
  business layer will import `describeLoadError` from. The value contract still holds — no Zod type
  escapes at runtime — but an `@internal` marker or a move would make that literally true.
- **`openDb` omits `idb`'s `DBSchema` type parameter**, so `cursor.value` is `any` flowing into
  `parseCharacter`. Safe because that parameter is `unknown`, but unchecked: ESLint runs
  `tseslint.configs.recommended`, not the type-checked config, so `no-unsafe-argument` is off.
- **No `src/data/index.ts` barrel.** The schema module has a rigorously designed single entry point;
  the data layer as a whole does not, so consumers will import from several deep paths.
- **Test fixtures are duplicated across six files** — the same `createCharacter({ name, id, now })`
  call. `src/test/` already exists and is the obvious home.
- **`wipe()` is duplicated** between `indexedDbRepository.test.ts` and `characterLifecycle.test.ts`,
  and both target the same database name. Safe only because Vitest isolates per file; setting
  `isolate: false` or sharing a pool would make them race.
- **`errors.test.ts`'s `indexOf` ordering assertion is brittle.** It is redundant with the two
  role-specific `toContain` assertions above it, and it produces a *false failure* once a version
  number reaches double digits: with `found: 10`, `indexOf('1')` lands inside `"10"`.
- **`describeLoadError` says "This file…"** for an `INVALID_AT_VERSION`, which is inaccurate when the
  refusal came from `save()` on a document the app itself built.
- **`toJsonText` takes `CharacterDocument`,** so it cannot pretty-print `getRaw()`'s `unknown` — the
  exact case the raw-JSON repair screen needs. Widening the parameter is a one-word change.
- **`describeLoadError` does not cap its issue list.** A document with hundreds of issues yields one
  unbounded line. Capping is a presentation decision for the repair screen.
- **`CharacterSummary` restates `classes` and `hitPoints` structurally** rather than deriving from
  `CharacterDocument`, so a new field on `HitPoints` would flow through at runtime while the type
  claims three keys.
- **No test asserts `SCHEMAS` has an entry for every version up to `CURRENT`**, which is step 4 of
  the README's add-a-version recipe.
- **Unused surface:** `defaultRegistry` and `DB_VERSION` are exported with no consumer outside their
  own files, and the `@/*` path alias has no users in `src` at all.

## Judged and dismissed

- The `caught instanceof Error` fallback in `fromJsonText` is dead — `JSON.parse` only throws
  `SyntaxError` — but removing it buys nothing.
- `!` non-null assertions appear in test files. The constraint's teeth are in production code.
- `documentShape`'s `.strict()` is applied at the export site rather than inline, and is covered by
  the table's document-root case.
- `parseCharacter`'s missing-schema branch reports a build misconfiguration as `MIGRATION_FAILED`
  rather than rethrowing. Deliberate: keeping the app alive beats crashing, and the doctrine
  exception is now documented on `runMigration`.
