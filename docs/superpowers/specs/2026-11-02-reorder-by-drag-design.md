# Reordering by drag — Design

The player holds a feat, spell or counter row and drags it up or down to a new place among its
neighbours, and holds a category's header to do the same with the whole category. While a row
is held, a lifted copy of it follows the finger, the other rows slide out of its way, and a
dashed skeleton marks the place it will land. Letting go drops it there, animated, and the new
order is saved like any other edit. Needs no schema change: since the 2026-09-20 restructure
(business-layer design, "§3.4 amended") categories and items are arrays, and their position in
the array is their display order.

The request was one paragraph and this design was made without a round of questions, as the
decimal-counters design was. The decisions marked _assumed_ below are the author's reading of
"hold on the item and move it up or down between other two items", and are the first thing to
revisit.

Status: **built 2026-11-02** on branch `claude/drag-drop-reorder-categories-qioc1n`, from
`docs/superpowers/plans/2026-11-02-reorder-by-drag.md`.

## 1. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Where | **The three categorized sections**: Feats & Traits, Spell List, Counters. Categories among themselves; items within one category, and within Uncategorized | What was asked for. One `CategorizedSection` serves all three, so it is one change. Inventory, Equipment and classes are the same mechanism later, and go to the backlog |
| Between categories by drag | **No.** An item stays in its bucket; the dialog's Category select moves it, as before | _Assumed_ from "within the categories". It keeps each list its own drag surface, which is what makes nested sortables work at all (§5) |
| The Uncategorized block | **Stays last and cannot be dragged.** Its rows can | It is not a category; it is where items go when they have none |
| How a drag starts | **Hold for 250 ms** without moving more than 5 px, on touch and with a mouse alike. A tap or click still opens the row's dialog, as before | "Hold on the item". The same gesture everywhere, so there is one thing to learn. _Assumed_: the delay |
| What is the handle | **The whole row** for an item; **the whole header row** for a category (caret, name, count, pencil, +) | "Hold on the item". A visible grip glyph would cost row width on a 320 px phone |
| Preview | A **lifted copy** of the row follows the finger; the **row's own slot becomes a dashed skeleton** that slides to where the row will land; the others slide aside. Dropping animates the copy into the slot | "Nice animation and a preview of the position using some skeletons" |
| A category drag | **Every block in the section collapses** while a category is held, and opens again on drop | A category is its header and its rows; dragging an open block with twenty rows past another is unworkable on a phone. _Assumed_ |
| Spell List's level sort | **The stored order is what the player dropped; the view still sorts by level.** A spell dragged above a lower level lands first within its own level, below a higher level last within it | The sort is a display order (`bind.ts`, `byLevel`); it stays. Spells of one level order freely. _Assumed_ |
| Library | **dnd-kit** (`@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, `@dnd-kit/utilities` 3.2.2) | "Something that already exists, from npm". See §2 for why this one |
| Keyboard reordering | **Not in this change.** Goes to the backlog | The row's one focusable control is the button that opens the dialog, so a keyboard path needs a control of its own. Everything else about a row stays reachable: the dialog's Category select still moves an item |
| Reduced motion | **No sliding, no drop animation**; the skeleton and the lifted copy still show | `prefers-reduced-motion`, as the rest of `styles.css` honours it |
| Stored how | **Array position**, as today. No `order` field, no schema bump | The business-layer design (2026-09-20) made reordering "a splice instead of reintroducing an explicit order array" |

## 2. Library

Three were weighed; all three are maintained and declare React 19.

- **dnd-kit** (chosen). Headless: it measures, tracks the pointer and computes the transforms,
  and the app draws everything with its own CSS. Its sortable preset moves the held row's own
  node to where it would land, which is exactly the skeleton the request asks for; a
  `DragOverlay` draws the lifted copy. About 13 kB gzipped for the three packages. Touch is a
  separate sensor with a delay constraint, so a finger that moves before the hold is a scroll,
  which is what a list on a phone needs.
- **@hello-pangea/dnd** (the react-beautiful-dnd fork). The best animation out of the box and a
  keyboard path for free, but its placeholder is an invisible gap in the source list, not a
  marker at the destination; it is about three times the size (it carries redux); and it owns the
  dragged element's positioning, which fights a bottom sheet with its own stacking.
- **Pragmatic drag and drop** (Atlassian). Framework-agnostic and small, but it draws nothing:
  the preview, the sliding and the drop animation would all be written here. The request asked
  for the opposite.

Each API this change relies on is checked against the installed version, not recalled
(AGENTS.md, "verify tooling behaviour"): the sensors' activation constraints, that
`useSortable` hands the held node a transform too, and what the touch sensor does about
scrolling and the long-press context menu.

## 3. Business layer

`src/business/categorized.ts`. The order of a list is set in one call, as the whole new order:

```ts
CategorizedBO.reorderCategories(ids: readonly string[]): void
CategorizedBO.reorderUncategorized(ids: readonly string[]): void
CategoryBO.reorderItems(ids: readonly string[]): void
```

- **The whole order, not an index**, because the UI's list and the stored list need not agree
  (the Spell List sorts its view by level). "Put these ids in this order" has one meaning for
  any list; "move this id to index 3" has one only when the two orders match.
- **`ORDER_MISMATCH`** (one new `RuleCode`) when `ids` is not exactly the list's current ids,
  each once: a missing id, an extra id, a repeat. The code is true of every value it rejects.
  Nothing is written before the check passes.
- **The same nodes, re-sliced**: the array is spliced to the same objects in the new order, so
  every item keeps its identity, its id and its contents. No clone, no re-fill. `CategoryBO`
  checks it is still in the document first (`GONE`), as its other writes do.
- **Autosave sees it**: `deepObserve` reports an array splice, and a node that leaves and
  arrives in the same splice is released and attached again, so an edit to a moved item still
  reaches autosave. A test proves that.
- Nothing new is exported from `index.ts`: the three are methods on classes it already exports.

## 4. UI

### View and actions

The views already list categories and items in stored order. `CategoryActions` gains two
entries, so all three sections get them through `CategorizedSection`:

```ts
reorderCategories(ids: string[]): void;
/** `categoryId` is `null` for Uncategorized, as everywhere else. */
reorderItems(categoryId: string | null, ids: string[]): void;
```

`bind.ts`'s `categoryActions` wires both: a category by id (`GONE` when missing, as rename
does), and `null` to `reorderUncategorized`. Neither is `attempt`-wrapped: `ORDER_MISMATCH`
cannot come from anything the player did, so it stays loud.

### Components

- **`SortableList<T>`** (`src/ui/components/SortableList.tsx`): the one place in `src/ui/` that
  imports dnd-kit. Takes `items`, `onReorder(ids)` and a render function
  `(item, handle) => ReactNode`, where `handle` is the props that make an element the thing to
  hold. It renders a `DndContext` with a mouse sensor and a touch sensor, both on a 250 ms hold
  with 5 px tolerance, a `SortableContext` in vertical list order, one wrapper per item, and a
  `DragOverlay` showing the held item rendered again. On drop it hands back the ids in their new
  order, built with `arrayMove`, and only when something moved. `onDragStart`/`onDragEnd`
  callbacks let the section know a drag is on (for the category collapse).
- **The wrapper** carries the transform and transition dnd-kit computes, and the skeleton
  styling while its item is held. The held node is not hidden: it is the skeleton.
- **`CategorizedSection`** wraps the category blocks in one `SortableList` whose handle is the
  `Block`'s header row, and each block's rows in a `SortableList` of their own whose handle is
  the wrapper itself. Nested `DndContext`s are supported by dnd-kit; the two never fight because
  a row is not inside a header, so a hold on a row reaches one context and a hold on a header
  the other. While a category is held, every block renders collapsed; the remembered open state
  is not touched, so the drop restores it.
- **`Block`** gains an optional `handle` prop, spread on its header row. Equipment does not pass
  one and is unchanged.
- **`ItemRow`** is unchanged. The wrapper goes around it.

### Look

- **Lifted copy**: the row on paper, rounded, with a shadow, slightly enlarged, `pointer-events:
  none` so it never catches the pointer the sensor is tracking.
- **Skeleton**: the row's wrapper with a dashed `--line` border and rounded corners, its contents
  invisible, and two grey bars drawn where the name and the preview would be. Its height is the
  row's own, so nothing jumps.
- **Sliding**: dnd-kit's own transition (200 ms, ease) on the other rows, set inline; turned off
  under `prefers-reduced-motion` from the stylesheet, which outranks an inline transition.
- **Rows keep their hairlines**: the wrapper breaks `.rec:first-of-type`, so the rule between
  rows moves to `.sortrow + .sortrow .rec`.
- **No text selection or callout** on a held row: `user-select: none` on the wrapper, and the
  touch sensor prevents the context menu while active (checked in the installed source).

## 5. Why nested lists, not one

One `DndContext` over the whole section, with categories and rows both sortable in it, would let
a row be dropped into another category — and would need every row's id and every category's id to
share one collision space, with the category strategy and the row strategy told apart on every
move. A list per bucket keeps a drag inside its bucket, which is what §1 decided, and each list
is the plain vertical case dnd-kit's preset is for.

## 6. Testing

Every new test is broken on purpose once to prove it bites (AGENTS.md, "Traps").

**Business** (`categorized.test.ts`):
- categories, a category's items and uncategorized items reordered; the items keep their ids
  and contents, and a business object held across the reorder still works
- `ORDER_MISMATCH` for a missing id, an extra id, a repeat, and a wrong length; nothing changes
- `GONE` on a removed category
- the round-trip test reorders and still satisfies `CURRENT_SCHEMA`
- `deepObserve.test.ts`: a reorder splice fires once, and an edit to a moved item fires after

**Binding** (`bind.test.tsx`): both actions reach the business object; `reorderItems(null, …)`
goes to uncategorized; the Spell List's view keeps sorting by level after a reorder.

**Components**: dnd-kit's sensors need layout that jsdom does not have, so the drag itself is
checked in a browser, and the tests cover what surrounds it:
- `SortableList.test.tsx`: renders every item once in order, calls `onReorder` with the moved
  order and not with an unchanged one (through the `DndContext` `onDragEnd` handler, driven
  directly), and renders the skeleton class on the held item
- `CategorizedSection.test.tsx`: the header row carries the handle, Uncategorized's does not;
  while a category drag is on, every block is collapsed; rows are inside sortable wrappers

**In the browser** (Chromium at 360 px, Playwright, with real pointer events):
- hold a feat 300 ms, move it below the next one, release: the order on screen changes and
  survives a reload
- the same for a category, and the blocks that were open are open again after the drop
- a tap on a row still opens its dialog, and a hold shorter than 250 ms moves nothing
- a spell dragged above a cantrip lands first within its level

## 7. Out of scope

Dragging an item into another category; reordering Inventory, Equipment and classes; a keyboard
path for reordering; the hub's section order. The first three go to `docs/BACKLOG.md`.

## 8. Deviations

The build matches this design except for these details.

- **Size.** §2 estimated 13 kB gzipped for the three packages; measured on the installed
  minified builds together they are about 17 kB.
- **The skeleton clips.** §4 said the skeleton's bars sit where the name and the preview line
  are. A category block held is only its header, so the second bar fell below it; the wrapper now
  clips with `clip-path: inset(0 round 12px)`, chosen over `overflow: hidden` because a clip
  starts no formatting context and so lets the header's top margin keep collapsing through the
  wrapper.
- **"The only importer" is a convention**, not a lint rule, like `bind.ts` being mobx's.
- **The browser check** ran at 393 px (Playwright's Pixel 5) rather than 360 px, and a mouse at
  1024 px besides. A hold shorter than the delay was checked at 80 ms, not "just under 250".
- **Two jsdom traps** are recorded in AGENTS.md: dnd-kit's 50 ms click-swallowing listener after
  a drop, and the overlay copy going a microtask later.
