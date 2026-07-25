# Schema versions

Each schema version lives in its own directory (`v1/`, `v2/`, ...) and owns everything it needs:
its Zod schemas and its tests, colocated. Nothing is shared between version directories. Once a
version has shipped, its directory is never edited again — not to fix a limit, not to tighten a
regex, not to "clean up" duplication with a later version.

## When the freeze begins

A version is frozen from the moment it could have written a document that someone still has —
a build using it has been released, or it has already stored real data — not from the moment
its directory was authored. Before that point the directory is ordinary work-in-progress and may
be edited freely, no migration required. If you are unsure which side of that line a version is
on, treat it as frozen and ask.

## Why

The migration loop that opens a stored character document validates it _at the version it claims
to be_, before running any migration function. That check is only meaningful if a version's
schema still means today what it meant when that version shipped.

If schemas were shared, a change made for v2's benefit would retroactively redefine v1. Tighten a
limit for v2 and a v1 document that was always legitimately valid — saved by a real player, on an
earlier build of the app — now fails validation at v1. The app reports `INVALID_AT_VERSION` and
refuses to open the character, blaming the player's file for a change the app made. Loosening a
rule instead is just as broken in the other direction: a document that should have been rejected
at v1 now passes, and reaches a `1 → 2` migration function that was written on the assumption a
document like it could never exist.

Per-version directories make this impossible by construction: there is no shared code left to
change out from under an old version.

## The duplication is deliberate

`v2/` will start life as a literal copy of `v1/`. Most of it will stay identical to `v1/`
indefinitely. That is the point, not an accident — the duplication _is_ the isolation mechanism.
Do not "DRY this up" by extracting shared primitives, a shared base schema, or a shared regex
across version directories. Anything shared is exactly the thing that would let a change to one
version reach another.

## The behavioural lock

Each version's tests are colocated with its schema and frozen along with it. That means editing
a v1 limit or regex to accommodate something v2 needs fails v1's own test suite immediately —
there is no separate step where that mistake could go unnoticed. If you find yourself editing an
assertion in a shipped version's test file to make it pass, that is the signal you are in the
wrong directory.

## Adding a new version

1. Copy the entire previous version's directory (e.g. `v1/` to `v2/`).
2. Edit only the new directory. The previous one does not change.
3. Write the migration function that takes a document from the previous version to the new one
   (`1 → 2`, and so on).
4. Register the new schema so the rest of the app can find it. That registration point is the
   only file outside a version directory that changes when a version is added — everything else
   about the new version lives inside its own directory.

## The one exception

If a version's schema turns out to be genuinely wrong — not "could be nicer," but wrong — the fix
is still a new version with a migration, never an edit to the shipped one. There is no case where
editing a shipped version's directory is the right move; correcting a mistake and adding a
deliberate change go through the same door.

## Import boundary

Only one entry point in this directory is meant to be imported from outside it; consumers ask for
"the current schema" or "the schema for version N" through that entry point and never reach into
a version directory directly. That entry point does not exist yet — it is introduced in the next
piece of work — but the intent already constrains how these directories are written: nothing in
`v1/` (or any future version) should assume it will be imported directly by anything other than
its own colocated test, because it won't be.
