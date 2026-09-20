# Data layer — deferred items

Carried out of the data-layer plan's review cycle. Everything here was found by a review, judged
deliberately, and left undone. Recorded because the working ledger it came from is scratch and does
not survive; git history is the record from here.

Nothing below blocks merge. The list exists so these get scheduled rather than quietly forgotten.

## Schedule into the business-layer plan

**Trim at the write boundary.** The schema rejects padded names rather than trimming them, because
trimming on load would silently rewrite a stored document. `createCharacter` trims its input; every
business-layer action that writes a name must do the same.

**`describeLoadError` reachability.** It is the layer's user-facing copy and lives in `data`, which
`ui` may not import. The business layer will need to re-export it.

**Take the row id from the summary.** `list()` now identifies rows by the store key, but `get()`
still returns a document whose internal `id` could diverge from its key. UI code must use
`summary.id`, never re-derive it from `doc.id`.

## Worth doing when the code is next touched

- **`toSchemaIssues` takes a `z.ZodError` parameter** and is exported from the same module the
  business layer will import `describeLoadError` from. The value contract still holds — no Zod type
  escapes at runtime — but an `@internal` marker or a move would make that literally true.
- **No `src/data/index.ts` barrel.** The schema module has a rigorously designed single entry point;
  the data layer as a whole does not, so consumers will import from several deep paths.
- **`errors.test.ts`'s `indexOf` ordering assertion is brittle.** It is redundant with the two
  role-specific `toContain` assertions above it, and it produces a *false failure* once a version
  number reaches double digits: with `found: 10`, `indexOf('1')` lands inside `"10"`.
- **`describeLoadError` says "This file…"** for an `INVALID_AT_VERSION`, which is inaccurate when the
  refusal came from `save()` on a document the app itself built.
- **`describeLoadError` does not cap its issue list.** A document with hundreds of issues yields one
  unbounded line. Capping is a presentation decision for the repair screen.
- **`CharacterSummary` restates `classes` and `hitPoints` structurally** rather than deriving from
  `CharacterDocument`, so a new field on `HitPoints` would flow through at runtime while the type
  claims three keys.
- **No test asserts `SCHEMAS` has an entry for every version up to `CURRENT`**, which is step 4 of
  the README's add-a-version recipe.
- **Unused surface:** `defaultRegistry` and `DB_VERSION` are exported with no consumer outside their
  own files, and the `@/*` path alias has no users in `src` at all.

## Done (2026-09-20)

Closed by the same-day data-layer restructure. Kept here for the record, not because anything
below still needs doing.

- **Storage-level failure handling.** `createIndexedDbRepository` now takes `blocked`, `blocking`
  and `terminated` callbacks on its `openDb` — surfaced to the caller as one `onFailure`, since
  reacting to any of the three means the same thing (a connection outside the app's control) — and
  `list()` awaits `tx.done`, so a mid-scan abort rejects the call instead of leaking an unhandled
  rejection. `save()`, `get()`, `getRaw()` and `delete()` route quota-exceeded and
  unavailable-database `DOMException`s through the typed `StorageFailure` taxonomy in the new
  `src/data/repository/storageFailure.ts`, instead of letting a raw `DOMException` escape.
- **An injectable `MigrationRegistry` on the repository.** `createIndexedDbRepository({ registry })`
  takes the same registry shape `parseCharacter` already accepted, so "loading a document written
  by an older schema" (spec §9) is now something a repository test can construct, the same way
  `parseCharacter`'s own tests already did.
- **`openDb` omitted `idb`'s `DBSchema` type parameter.** The store is now typed through `idb`'s
  `DBSchema` as `{ key: string; value: unknown }`, so a cursor's value is `unknown` flowing into
  `parseCharacter`, not `any`.
- **`openDb` was exported production surface.** It no longer is: only the `OpenDb` *type* and the
  constants `DB_NAME`, `DB_VERSION`, `CHARACTER_STORE` are exported. `createIndexedDbRepository`
  takes an optional `openDb` for tests; the default opener is a private closure a production
  consumer cannot reach, so there is no way left to write straight past `save()`'s validation.
- **`toJsonText` took `CharacterDocument`.** It takes `unknown` now, so the repair screen can
  pretty-print a document that failed validation — the exact case it exists for.
- **Test fixtures were duplicated across six files, and `wipe()` between two.** Both now live once,
  in `src/test/fixtures.ts` (`ID_A`, `ID_B`, `FIXED_NOW`, `docFor`, `wipe`, `createOpener`,
  `putRaw`), imported everywhere they used to be redefined.

## Judged and dismissed

- The `caught instanceof Error` fallback in `fromJsonText` is dead — `JSON.parse` only throws
  `SyntaxError` — but removing it buys nothing.
- `!` non-null assertions appear in test files. The constraint's teeth are in production code.
- `documentShape`'s `.strict()` is applied at the export site rather than inline, and is covered by
  the table's document-root case.
- `parseCharacter`'s missing-schema branch reports a build misconfiguration as `MIGRATION_FAILED`
  rather than rethrowing. Deliberate: keeping the app alive beats crashing, and the doctrine
  exception is now documented on `runMigration`.
