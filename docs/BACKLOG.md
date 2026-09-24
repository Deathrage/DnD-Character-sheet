# Backlog

Possible future features. Nothing here is committed to — an entry is an idea with enough context
that whoever picks it up does not have to rediscover why it was written down.

Before adding an entry, check it against [Won't do](#wont-do). Anything that computes a rule is a
non-goal (spec §1), not a backlog item.

Entry format: a bold title, one line on what it is, then whatever context matters — where the
change lands, what it must not break, open questions. Move an entry to [Done](#done) with the
commit or PR that shipped it, rather than deleting it.

## Candidates

- **Automatic cloud sync.** A coarse trigger (on `pagehide`, or every few minutes) for the cloud
  backup shipped on branch `feature/cloud-backup` (PR pending) — never local autosave's debounce,
  because Firestore bills per write.
- **Online features as a paid subscription.** Remote backup and cross-device sync would be part of
  a paid subscription, behind user authentication. The local app stays complete and free without
  an account: signing out or lapsing must never lock a player out of characters on their device.
  Open: auth provider, billing, and what a lapsed subscriber's remote copies become.
- **Periodic update check.** The service worker only checks for a new version on launch or
  reload; a long-open tab never sees one.
- **Undo.** Cheap against a single-document model. Out of scope by decision today (spec §6), so
  building it means amending the spec's non-goals first.
- **Local revision history.** Same as undo: a non-goal in spec §1 today, and cheap to add against a
  single-document model once that decision changes.
- **Label or skip journal days.** `journal` is index-as-day, so days cannot be skipped or named
  (spec §11). Needs a schema version bump — read `src/data/schema/README.md` first.
- **Links between feats, items, equipment and counters.** Operate a counter from the feat, item
  or equipment it belongs to, and read that entry's description from the counter. Two kinds:
  - _grants_: Font of Magic grants Sorcery Points. At most one per counter. "Add counter" in the
    feat's detail creates the counter already linked.
  - _uses_: Twinned Spell uses Sorcery Points. Any number. "Link counter" picks an existing one.

  Leaning towards a separate `links: { id, kind, fromId, counterId }[]` in the document rather
  than fields on each entity. Deleting either end removes its links; only `grants` prompts to
  delete the other end too. Open: exact shape, and whether deleting a granted counter should
  offer to delete its feat. Needs a schema version bump — read `src/data/schema/README.md` first.
  A dangling link must fail validation (the one promise).

- **Item weight.** A `weight` on inventory items (per unit) and equipment; the inventory shows the
  total, derived and never stored like `level` (add it to the spec §1 exception list). No units,
  no coin weight, no encumbrance — those are rules. Open: default `0` vs "not entered".
- **Compendium.** Reusable templates, e.g. Font of Magic + Sorcery Points + their `grants` link.
  Applying one copies its entries into the character with fresh ids; editing a template never
  changes a character. Lives outside character documents (own store, own schema), so a
  character may record which template an entry came from, but must never depend on it. Builds on
  links. Open: nearly everything about its shape.

## Done

- **Remote backup and restore.** Shipped on branch `feature/cloud-backup` (PR pending). Google
  sign-in, dated versions in Firestore — upload, list, restore and delete. Design and the storage
  decision (Firestore only, Cloud Storage is not on the Spark plan) are in
  `docs/superpowers/specs/2026-09-24-cloud-backup-design.md`.
