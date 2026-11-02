# Reordering by Drag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Categories, and items within a category or within Uncategorized, can be reordered by
holding and dragging, in Feats & Traits, Spell List and Counters, with a lifted copy following the
finger, a skeleton at the landing place, and the others sliding aside. No schema change.

**Architecture:** Three business methods set a list's whole order from its ids
(`reorderCategories`, `reorderItems`, `reorderUncategorized`, `ORDER_MISMATCH` when the ids are
not exactly the list's). `CategoryActions` gains `reorderCategories` and `reorderItems`, wired in
`bind.ts`. A new `SortableList` component, the one importer of dnd-kit in `src/ui/`, wraps a list
in a `DndContext` + `SortableContext` with hold-to-drag sensors and a `DragOverlay`;
`CategorizedSection` uses it once for the category blocks (handle: the header row) and once per
block for the rows (handle: the row). Styles in `styles.css`.

**Tech Stack:** TypeScript 6, MobX 7, React 19, `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable`
10.0.0, `@dnd-kit/utilities` 3.2.2, Vitest 4 + Testing Library, ESLint 10, Playwright (Chromium)
for the browser check.

**Spec:** `docs/superpowers/specs/2026-11-02-reorder-by-drag-design.md`

## Global Constraints

- Nothing is computed; the order is what the player dropped. The Spell List view keeps its
  level sort over the stored order.
- No schema or migration change. No `order` field.
- The business layer never exposes a live array; a reorder is a splice of the same nodes.
- `src/ui/components/SortableList.tsx` is the only file under `src/ui/` that imports dnd-kit.
- A tap or click on a row still opens its dialog; a drag starts only after a 250 ms hold.
- Before every commit: `npm test`, `npm run typecheck`, `npm run lint`, `npx prettier --check .`.
- Every new test is broken once on purpose to prove it bites, then restored.
- Commit messages: Conventional Commit prefixes, ending with the session's attribution lines.

---

## File map

| File | Change |
|---|---|
| `package.json`, `package-lock.json` | The three dnd-kit packages |
| `src/business/errors.ts` | `ORDER_MISMATCH` |
| `src/business/categorized.ts` (+ test) | `reorderCategories`, `reorderUncategorized`, `CategoryBO.reorderItems`, a shared `reorder` helper |
| `src/business/deepObserve.test.ts` | A reorder splice fires, and a moved item is still observed |
| `src/business/characterSheet.roundTrip.test.ts` | Reorder, still satisfies `CURRENT_SCHEMA` |
| `src/ui/types.ts` | `CategoryActions.reorderCategories`, `reorderItems` |
| `src/ui/bind.ts` (+ `bind.test.tsx`) | Wire both in `categoryActions` |
| `src/ui/fixtures.ts` | The two entries on the three `no*Actions` |
| `src/ui/components/SortableList.tsx` (+ test) | Create |
| `src/ui/components/CategorizedSection.tsx` (+ test) | Sortable blocks and rows; `Block.handle` |
| `src/ui/styles.css` | `.sortrow`, `.sortrow.held`, `.draglift`, reduced motion |
| `AGENTS.md`, `docs/BACKLOG.md`, the spec | Record it |

---

### Task 1: Business layer

- [ ] `categorized.test.ts`: reorder categories, a category's items, uncategorized; ids and
      contents kept; a held business object still works after; `ORDER_MISMATCH` for a missing,
      extra, repeated id and a wrong length, with nothing changed; `GONE` on a removed category.
- [ ] `errors.ts`: `ORDER_MISMATCH`.
- [ ] `categorized.ts`: `reorder(list, ids)` helper (check, then one `splice`), the three methods.
- [ ] `deepObserve.test.ts`: a reorder splice fires once; an edit to a moved item fires after.
- [ ] `characterSheet.roundTrip.test.ts`: reorder in the fill, still valid.
- [ ] Commit: `feat(business): set a categorized list's order from its ids`.

### Task 2: Binding

- [ ] `types.ts`: the two actions on `CategoryActions`, documented.
- [ ] `fixtures.ts`: add them to `noFeatsActions`, `noSpellListActions`, `noCountersActions`.
- [ ] `bind.test.tsx`: both actions reach the business object; `null` goes to uncategorized; the
      Spell List view still sorts by level after a reorder.
- [ ] `bind.ts`: `categoryActions` wires them.
- [ ] Commit: `feat(ui): reorder actions on the categorized sections`.

### Task 3: SortableList and CategorizedSection

- [ ] `npm install @dnd-kit/core@6.3.1 @dnd-kit/sortable@10.0.0 @dnd-kit/utilities@3.2.2`.
- [ ] `SortableList.test.tsx`: items render once each in order; `onDragEnd` with a move calls
      `onReorder` with the new ids, without a move calls nothing; the held wrapper has `held`.
- [ ] `SortableList.tsx`: sensors (mouse + touch, delay 250, tolerance 5), `SortableContext`,
      `SortableRow` wrapper (transform, transition, `held` class), `DragOverlay` with the same
      render, `onReorder` via `arrayMove`, `onDragStateChange(active: boolean)`.
- [ ] `CategorizedSection.test.tsx`: category header rows carry the handle, Uncategorized's does
      not; every block collapses while a category drag is on; rows are inside `.sortrow`.
- [ ] `CategorizedSection.tsx`: categories in a `SortableList` with the handle on the header;
      each block's rows in a `SortableList`; `Block.handle` prop.
- [ ] `styles.css`: `.sortrow`, hairline rule, `.held` skeleton, `.draglift`, reduced motion.
- [ ] Commit: `feat(ui): hold and drag to reorder categories and their items`.

### Task 4: Browser check and docs

- [ ] Playwright against `vite` at 360 px: hold-drag a feat, reload, order kept; the same for a
      category with blocks open before and after; a tap opens the dialog; a short hold moves
      nothing; a spell dragged above a cantrip lands first within its level.
- [ ] `AGENTS.md` entry, `docs/BACKLOG.md` (done + follow-ups), spec status line.
- [ ] Commit: `docs: record reordering by drag`.
