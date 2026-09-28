# Backlog

Possible future features. Nothing here is committed to — an entry is an idea with enough context
that whoever picks it up does not have to rediscover why it was written down.

Before adding an entry, check it against [Won't do](#wont-do). Anything that computes a rule is a
non-goal (spec §1), not a backlog item.

Entry format: a bold title, one line on what it is, then whatever context matters — where the
change lands, what it must not break, open questions. Move an entry to [Done](#done) with the
commit or PR that shipped it, rather than deleting it.

## Candidates

- **Automatic cloud sync.** An "Auto sync" checkbox per character. Each synced character has one
  cloud entry tagged _Auto sync_ that rewrites itself; the dated versions stay the history a player
  saves on purpose. Editing on the laptop and finding the change on the phone is the point.
  - _One slot, not new versions._ Layout v2 keeps a player's whole cloud in one 1 MiB document;
    a version every few minutes of a session would fill it within months. The slot needs layout 3
    (a shipped layout is never edited). Its portrait is stored by hash, like a version's.
  - _Never blind last-writer-wins._ Each device remembers its base, the slot stamp it last synced
    from (upload time plus a device id). Local unchanged, cloud changed: replace the local copy
    silently. Local changed, cloud unchanged: upload. Both changed: the existing Replace / Keep
    both dialog. Silently replacing in the last case would drop a device's edits (the one promise).
  - _The base lives beside the document, not in it_, like portraits: a small IndexedDB store keyed
    by character id, so a `DB_VERSION` bump. In the document it would need a schema bump and would
    leak into exported files.
  - _Triggers._ Upload at most every few minutes and on `pagehide`, never on autosave's debounce:
    Firestore bills per write, and Spark's ~20k writes/day are shared by every player. Notice
    other devices with an `onSnapshot` listener on `cloud/{uid}`, not polling.
  - _An open sheet._ A remote change applies only while autosave has nothing pending, and swaps the
    sheet under the UI; otherwise it is the both-changed case.
  - _The checkbox is stored in the cloud_, per character, so a newly signed-in device knows what to
    pull.
  - _Edges._ The slot is pinned at the top of the versions list and cannot be deleted while sync is
    on. Restoring a dated version while syncing makes it the new slot, which then reaches the
    other devices; the restore dialog says so. Turning sync off freezes the slot into an ordinary
    dated version, so nothing disappears. Deleting the character locally keeps the slot, or a
    delete on one device would wipe it everywhere.
- **Online features as a paid subscription.** Remote backup and cross-device sync would be part of
  a paid subscription, behind user authentication. The local app stays complete and free without
  an account: signing out or lapsing must never lock a player out of characters on their device.
  Open: auth provider, billing, and what a lapsed subscriber's remote copies become.
  Charging makes the operator a trader and players consumers, so the Terms of Use
  (`src/ui/screens/Legal.tsx`) need a legal rewrite first: consumer-law protections, the 14-day
  withdrawal right for digital services, trader identification, and a real acceptance record
  rather than accept-by-using.
- **"Legal documents changed" notice.** The Privacy Policy and Terms of Use
  (`src/ui/screens/Legal.tsx`) promise that significant changes are announced in the app, and
  the Terms promise 30 days' notice before cloud backup is discontinued. Nothing does that yet:
  the promise is kept by shipping this together with the first such change, not before. Sketch:
  a `LEGAL_UPDATED` date beside `UPDATED`, bumped only for significant edits; a dismissible strip
  on the character list linking both pages; the dismissed date in `localStorage` (a per-device
  convenience, not a record of acceptance). A first visit stores the date silently, since a new
  player has no older version to be told about. The discontinuation notice is the same strip
  with different text. It reaches players through the existing update prompt.
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
- **Cloud quota and portrait deduplication.** 1 MiB per player, one versioned document —
  `docs/superpowers/specs/2026-09-25-cloud-quota-design.md`.
- **Death saving throws.** Shipped on branch `claude/death-saving-throws-msnizp` as schema v4:
  `hitPoints.deathSaves`, two counts of ticked boxes, in a row across the bottom of the hit
  points tile. The open question is settled: it cannot be opened by hand above 0 HP (typing 0 does
  it), and it stays open while any box is ticked, so a tick is never hidden. AGENTS.md's "Schema
  v4" entry has the rest.
