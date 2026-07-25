# D&D Character Sheet — Design

**Date:** 2026-07-25
**Status:** Approved, ready for implementation planning
**Inputs:** `docs/start/START.md`, `docs/start/Model.ts`, `docs/start/Wireframe.html`

## 1. Purpose

A deliberately unintelligent D&D character sheet: a flexible, manually driven record that never computes a rule for you. Every number is entered by the player, so any homebrew, house rule, or edition variation is expressible without the app disagreeing.

One character is one JSON document. Local storage is the master copy. Remote storage arrives later as a backup you sync on command.

### Non-goals

- No rules automation of any kind. No derived modifiers, no saving throws computed from ability scores, no spell-slot tables by class and level.
- No dice roller, no combat tracker, no character builder or level-up wizard.
- No local revision history and no undo. Versioning exists only for remote upload and restore, later.
- No multi-user editing, no sharing, no accounts.

### Deliberate exception to "no computation"

Three values in `Model.ts` are documented as getters. They are pure structural views over stored data, not rules, and so they are permitted — but they are **never stored in the file**:

| Derived value | Definition |
| --- | --- |
| `level` | Sum of `level` across `classes` |
| Attuned equipment | `weapons` + `other` filtered by `attuned === true` |
| Equipped equipment | `weapons` + `other` filtered by `equipped === true` |

`equipped` and `attuned` are treated identically throughout: each is a boolean on the item, each produces a derived list, and each gets its own toggle in the equipment dialog. Neither carries a rule — the app does not cap attunement at three or check whether armour can be worn.

## 2. Architecture

Four directories under `src/`, with import direction enforced by lint rather than by discipline:

```
src/data/       schema, versioning, migration, serialization, repository
src/business/   MobX facades, actions, derived values, autosave
src/ui/         React components, screens, Storybook stories
src/shared/     types and helpers used by more than one layer
```

| Layer | May import |
| --- | --- |
| `ui` | `business`, `shared` |
| `business` | `data`, `shared` |
| `data` | `shared` |
| `shared` | nothing internal |

Enforced by an ESLint `no-restricted-imports` zone so a violation fails the build. This is what will keep the future remote-storage layer from leaking upward into business logic.

The business layer always sees the **current** schema version. Migration is entirely encapsulated in `data`.

## 3. The document

### 3.1 Deltas from `Model.ts`

`Model.ts` is authoritative for which fields exist. These are the only changes, each with its reason.

| Change | Reason |
| --- | --- |
| **Added** `schemaVersion: 1` | `START.md` requires an explicitly versioned model; `Model.ts` had no version field |
| **Added** `id: string` (UUID) | Needed as the IndexedDB key and for routing |
| **Added** `name: string` | `Model.ts` has no character name, but the list screen cannot exist without one |
| **Added** `updatedAt: string` (ISO 8601) | Remote sync will need it; cheap to maintain now |
| **Added** `classOrder: string[]` | JSON objects have no guaranteed key order; user-controlled ordering must be explicit |
| **Added** `categoryOrder: string[]` to every `Categorized<T>` | Same reason |
| **Removed** `AbilitiesItem.proficient` | Ability-check proficiency has no referent in the rules. Proficiency attaches to armour, weapons, tools, skills and saving throws — never to a bare ability. `savingThrowProficient` and `SkillsItem.proficient` already cover the real cases |
| **Not stored** `level` | Derived; lives on the business facade |
| **Not stored** `Equipment.attuned`, `Equipment.equipped` | Derived views; stored shape is `weapons[]` and `other[]`, each item carrying its own `attuned` and `equipped` booleans |
| **Narrowed** `SpellListItem.level` to `'c'` or `1`–`9` | `Model.ts` invites this ("may be turned in enum"), and explicit typing is a stated goal |

Note that `SpellListItem.level` uses `'c'` for cantrips, per `Model.ts`. The wireframe used `0`; the wireframe is not authoritative here.

### 3.2 Shape

```ts
// ---- primitives -------------------------------------------------------
type ShortName = string;      // 1..80 chars, trimmed, non-empty
type CategoryName = string;   // 1..40 chars, trimmed, non-empty
type LongText = string;       // 0..20000 chars

interface Name { name: ShortName }
interface NameAndDescription extends Name { description: LongText }

/** `current` is intentionally NOT validated against `total` — the player may
 *  deliberately exceed it (temporary boosts, DM fiat). Both are >= 0 integers. */
interface CurrentAndTotal { current: number; total: number }

interface Categorized<T> {
  categories: Record<CategoryName, T[]>;
  categoryOrder: CategoryName[];   // permutation of Object.keys(categories)
  uncategorized: T[];
}

// ---- sections ---------------------------------------------------------
interface JournalAndNotes {
  /** index = day index. Append at the end only; delete the newest only. */
  journal: LongText[];
  notes: LongText;
}

interface InventoryItem extends NameAndDescription { count: number }
interface Inventory {
  coins: { pp: number; gp: number; ep: number; sp: number; cp: number };
  items: InventoryItem[];
}

interface EquipmentItem extends NameAndDescription {
  attuned: boolean;
  equipped: boolean;
}
interface Equipment { weapons: EquipmentItem[]; other: EquipmentItem[] }

interface FeatAndTraitsItem extends NameAndDescription {}

type SpellLevel = 'c' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
interface SpellListItem extends NameAndDescription {
  level: SpellLevel;
  prepared: boolean;
}

interface SpellSlotCounter extends CurrentAndTotal {}
interface CountersItem extends NameAndDescription, CurrentAndTotal {}
interface Counters extends Categorized<CountersItem> {
  spellSlots: Record<1|2|3|4|5|6|7|8|9, SpellSlotCounter>;
}

interface AbilitiesItem {
  score: number;                 // >= 0 integer
  modifier: number;              // integer, may be negative; UI shows explicit sign
  savingThrowModifier: number;   // integer, may be negative; UI shows explicit sign
  savingThrowProficient: boolean;
}
interface SkillsItem {
  modifier: number;              // integer, may be negative; UI shows explicit sign
  proficient: boolean;
  expertise: boolean;
}
interface AbilitiesAndSkills {
  proficiencyBonus: number;
  passivePerception: number;
  speed: number;
  abilities: Record<
    'strength'|'dexterity'|'constitution'|'intelligence'|'wisdom'|'charisma',
    AbilitiesItem
  >;
  skills: Record<
    'acrobatics'|'animalHandling'|'arcana'|'athletics'|'deception'|'history'
    |'insight'|'intimidation'|'investigation'|'medicine'|'nature'|'perception'
    |'performance'|'persuasion'|'religion'|'sleightOfHand'|'stealth'|'survival',
    SkillsItem
  >;
}

interface ClassItem extends Name { level: number }
interface HitPoints extends CurrentAndTotal { temporary: number }
interface HitDicesItem extends CurrentAndTotal {}

// ---- document root ----------------------------------------------------
interface CharacterDocumentV1 {
  schemaVersion: 1;
  id: string;         // UUID v4, via crypto.randomUUID()
  name: ShortName;
  updatedAt: string;  // ISO 8601

  classes: Record<ShortName, ClassItem>;
  classOrder: ShortName[];

  hitPoints: HitPoints;
  /** Key is the die size in digits, e.g. "8" for d8. JSON stringifies object
   *  keys, so `Record<number, …>` in Model.ts serializes this way. Display
   *  order is numeric ascending, so no order array is needed. */
  hitDices: Record<string, HitDicesItem>;
  armorClass: number;

  journalAndNotes: JournalAndNotes;
  inventory: Inventory;
  featsAndTraits: Categorized<FeatAndTraitsItem>;
  equipment: Equipment;
  spellList: Categorized<SpellListItem>;
  counters: Counters;
  abilitiesAndSkills: AbilitiesAndSkills;
}
```

The ability keyed to each skill (Acrobatics → DEX and so on) is **not** stored. It is reference data and lives as a UI constant.

### 3.3 Invariants the data layer enforces

- `categoryOrder` is a permutation of `Object.keys(categories)` — no missing and no extra keys.
- `classOrder` is a permutation of `Object.keys(classes)`.
- For every entry in `classes`, the map key equals `value.name`.
- `hitDices` keys match `/^[1-9]\d*$/` — a die size, rendered as `d{key}`.
- **Non-negative integers:** `ClassItem.level`, `armorClass`, `proficiencyBonus`, `passivePerception`, `speed`, `AbilitiesItem.score`, `InventoryItem.count`, every `coins` amount, `HitPoints.temporary`, and both members of every `CurrentAndTotal`.
- **Signed integers:** `AbilitiesItem.modifier`, `AbilitiesItem.savingThrowModifier` and `SkillsItem.modifier` are the only fields that may be negative. The UI always renders these with an explicit sign.
- Names are trimmed and non-empty after trimming.
- `current` is never validated against `total`, per §3.2.

## 4. Versioning and migration

Validation uses **Zod**. Migration is a short explicit loop — no dedicated library exists that is worth depending on. An npm survey found only `json-schema-migrate` (a different problem: migrating JSON *Schema* documents to draft-06, unmaintained since 2021) and `@loydjs/zod-compat` (4 weekly downloads). The proven implementations of this pattern, `redux-persist`'s `createMigrate` and zustand's `persist({version, migrate})`, are both welded to their own state libraries and cannot serve a MobX app.

```ts
const CURRENT = 1;
const SCHEMAS: Record<number, ZodType> = { 1: CharacterDocumentV1Schema };
const MIGRATIONS: Record<number, (doc: unknown) => unknown> = {}; // empty at v1

/** Throws a typed LoadError. Wrapped by parseCharacter below. */
function upgrade(raw: unknown): CharacterDocument {
  const version = versionOf(raw);        // throws UNVERSIONED / FROM_FUTURE
  let doc: unknown = raw;
  for (let v = version; v < CURRENT; v++) {
    doc = validateAt(v, doc);            // validate BEFORE migrating
    doc = runMigration(v, doc);          // v -> v+1
  }
  return validateAt(CURRENT, doc);
}

export function parseCharacter(raw: unknown): LoadResult {
  try {
    return { ok: true, doc: upgrade(raw) };
  } catch (cause) {
    return { ok: false, error: asLoadError(cause), raw };
  }
}
```

Validating before each step means a migration function may assume a well-formed input for its own version, which keeps migrations small and pure — and therefore unit-testable against a stored fixture per version.

### Error taxonomy

A document that cannot be loaded is **never** silently repaired, defaulted, or dropped. Loading returns a discriminated result and the raw JSON is retained so the raw-JSON editor can show it for hand-repair.

| Error | Condition |
| --- | --- |
| `UNVERSIONED` | `schemaVersion` missing, not a number, or not a positive integer |
| `FROM_FUTURE` | `schemaVersion > CURRENT` — a newer build wrote it; refuse rather than risk corrupting it |
| `INVALID_AT_VERSION` | Failed its own version's schema; carries the Zod issues |
| `MIGRATION_FAILED` | A migration function threw; carries the version and cause |

```ts
type LoadResult =
  | { ok: true;  doc: CharacterDocument }
  | { ok: false; error: LoadError; raw: unknown };
```

## 5. Storage

### Decision: one PWA over IndexedDB

Real files on disk are impossible as a primary store for an app that must run on a phone. Verified against MDN's browser-compat-data and caniuse: `showOpenFilePicker`, `showSaveFilePicker` and `showDirectoryPicker` are **Chromium desktop only** — Firefox has declined the spec, Safari and iOS Safari have never shipped them, and neither has Chrome on Android. The handle interfaces that *do* show broad support (Chrome 86, Firefox 111, Safari 15.2) are reachable only via `navigator.storage.getDirectory()`, i.e. the Origin Private File System, which is just as invisible to a file manager as IndexedDB and offers no durability advantage.

`START.md` explicitly permits this: a character's JSON "does not have to be literally a file on filesystem".

### Durability, which needs answering because IndexedDB is evictable

IndexedDB is cleared by "clear browsing data", may be evicted under storage pressure, is scoped to the exact origin, and is invisible to file managers and cloud sync. Three mitigations, all first-class features rather than afterthoughts:

1. **Export / Import `.json`** — a download and a file input, which work on every platform including iOS. This is how a character becomes a real file you can keep, back up, sync, or commit to git.
2. **Raw-JSON editor in the app** — view and edit the document as text, validated on save, errors reported rather than swallowed. Emergency repair works on a phone, which DevTools access does not: IndexedDB values are read-only in DevTools and editing them requires a console script.
3. **`navigator.storage.persist()`** requested on first save.

### Repository

```ts
interface CharacterSummary {
  id: string;
  name: string;
  totalLevel: number;                 // computed while mapping, never stored
  classes: { name: string; level: number }[];   // in classOrder
  hitPoints: HitPoints;
}

interface CharacterRepository {
  list(): Promise<CharacterSummary[]>;
  get(id: string): Promise<LoadResult | null>;   // null when no such id
  save(doc: CharacterDocument): Promise<void>;
  delete(id: string): Promise<void>;
}
```

IndexedDB via `idb`: database `dnd-character-sheet`, one object store `characters` keyed by `id`. `list()` reads full documents and maps them to summaries — with a handful of characters this is cheaper than maintaining a denormalized index, and can be revisited if it ever matters. A document that fails to load is still listed, flagged as damaged, so it can be opened in the raw-JSON editor rather than disappearing.

Import routes through the **same** `parseCharacter` path as loading, so an old or corrupt exported file is migrated and validated identically. Import always **creates** a character, assigning a fresh `id`, so it can never silently overwrite one. Importing to update an existing character is out of scope.

This interface is the seam that later carries a File System Access mirror, a Tauri filesystem adapter, or the remote sync layer, without any change above it.

## 6. Business layer

### MobX, with a plain observable document

The document is a plain observable tree, so `toJS(doc)` **is** the file — no class hydration or dehydration layer across fifteen interfaces. A thin facade sits on top holding the actions and the derived values. Because derived values live on the facade and not on the document, they physically cannot leak into the saved JSON.

```ts
class CharacterStore {
  readonly doc: CharacterDocument;
  constructor(doc: CharacterDocument) {
    this.doc = observable(doc);
    // `doc` is observable.ref because observable() already deep-wrapped it;
    // reads *through* it are still tracked normally.
    makeAutoObservable(this, { doc: observable.ref }, { autoBind: true });
  }
  get level(): number { /* sum of class levels */ }
  get attuned(): EquipmentItem[] { /* filtered view */ }
  get equipped(): EquipmentItem[] { /* filtered view */ }
}
```

`CharacterLibrary` is the corresponding facade for the list screen: load, create, delete, import, export.

### Actions carrying rules

Most edits are direct field writes. These have rules and must be actions:

| Action | Rule |
| --- | --- |
| `appendJournalDay()` | Appends at the end only |
| `deleteNewestJournalDay()` | Deletes the last entry only; no other index is deletable |
| `renameCategory(from, to)` | Re-keys `categories`, rewrites `categoryOrder` in place; rejects a name already in use; commits on confirm, not per keystroke |
| `deleteCategory(name)` | Moves its items to `uncategorized`, then removes the key and its order entry |
| `createCategory(name)` | Rejects duplicates and empty names; appends to `categoryOrder` |
| `reorderCategories(order)` | Accepts only a permutation of the existing category names |
| `moveItemToCategory(...)` | Keeps `categories` and `uncategorized` mutually exclusive |
| `addClass` / `removeClass` / `renameClass` | Keeps map key and `value.name` equal, maintains `classOrder` |
| `reorderClasses(order)` | Accepts only a permutation of the existing class names |

Category rename commits on confirm rather than on each keystroke because renaming re-keys the map — the wireframe rewrote it on every `oninput`, which would re-key mid-word and cannot handle a transiently duplicate or empty name.

### Autosave

```
deepObserve(store.doc, …)  →  debounce 500ms  →  toJS(doc)
                           →  stamp updatedAt on the plain copy
                           →  validate against CURRENT  →  repository.save
```

`updatedAt` is stamped on the plain copy and **never** written back to the observable document — doing so would retrigger `deepObserve` and loop forever.

Plus a forced flush on `pagehide` and on `visibilitychange` to `hidden`, so a backgrounded phone tab cannot lose the last edit.

If validation fails on save, the write is **refused** and an error is surfaced prominently. That condition means a business-layer bug, so it must be loud rather than silently retried.

No undo stack. No local revision history. Both are cheap to add later against a single-document model if they turn out to be missed.

## 7. UI layer

React + Vite + TypeScript strict, with plain CSS and custom properties. No component framework: the wireframe already defines the visual language, and matching it directly is cheaper than overriding a library's defaults.

### Navigation — the prototype's hub, kept

Vitals pinned at the top; a grid of section tiles below it; tapping a tile replaces the grid with that section; closing returns to the grid.

Routing uses `react-router` so the phone's Back button pops the section and then the hub for free, rather than needing special-casing:

| Route | Screen |
| --- | --- |
| `/` | Character list |
| `/c/:id` | Hub — vitals plus section grid |
| `/c/:id/:section` | One section |
| `/c/:id/json` | Raw-JSON editor |

### `ResponsiveDialog`

One component, two presentations chosen by `matchMedia` at a 640px breakpoint:

- **Below 640px** — a bottom sheet anchored above the on-screen keyboard. A centred modal with the keyboard up has roughly 145px to work with, which collapses a description textarea to a single line and pushes toggles off-screen.
- **640px and above** — the prototype's centred modal, unchanged.

Focus is trapped, the scrim dismisses, and the slide transition is suppressed under `prefers-reduced-motion`.

### Editing behaviour

Fields write through store actions on change; autosave debouncing absorbs the keystroke rate. Category rename is the one commit-on-confirm exception.

Numeric fields with a sign (`modifier`, `savingThrowModifier`) always display an explicit `+` or `-`, per `Model.ts`.

### PWA

`vite-plugin-pwa`: manifest, installable on phone and desktop, offline application shell.

## 8. First slice

Full depth through all three layers, narrow surface. Everything below is in scope.

**Data layer** — v1 Zod schema with all invariants from §3.3, the migration loop with its error taxonomy, serialization, and the IndexedDB repository.

**Business layer** — `CharacterStore`, `CharacterLibrary`, the rule-carrying actions for classes, hit dice and categories, and autosave with flush-on-hide.

**UI** — character list; vitals header; hub grid with all seven tiles present, six visibly inert and only Feats & Traits wired; the Feats & Traits section in full; the raw-JSON editor.

### Acceptance criteria

1. Creating a character shows it in the list with name, classes, total level and HP.
2. Total level in the vitals pill equals the sum of class levels, and updates as class levels change.
3. Class add, remove, rename and level edits round-trip through a reload.
4. HP current, max and temporary, and AC, round-trip through a reload.
5. Hit dice per die type — add, remove, current, max — round-trip through a reload.
6. Feats & Traits: create, edit and delete entries; create, rename and reorder categories; deleting a category moves its entries to Uncategorized; a duplicate category name is rejected with a visible message.
7. Editing an entry below 640px shows a bottom sheet with every field visible while the keyboard is open; at 640px and above the same edit shows a centred modal.
8. Export produces a `.json` that Import restores into an equivalent character under a new `id`.
9. The raw-JSON editor rejects a malformed document with a readable error and leaves the stored document untouched.
10. A stored document with `schemaVersion` absent, or greater than `CURRENT`, or failing v1 validation, surfaces the corresponding error and offers the raw JSON for repair — it is never silently repaired.
11. Edits made and then immediately backgrounding the tab are still present on reopening.
12. All seven hub tiles render; the six unwired ones are visibly inert and navigate nowhere.

### Out of scope for the first slice

The other six sections (Journal & Notes, Inventory, Equipment, Spell List, Counters, Abilities & Skills), remote storage, the File System Access mirror, any Tauri shell, undo, and local revision history.

## 9. Testing

Vitest with `@testing-library/react`. Tests are written first, per the project's TDD practice, starting at the data layer where the rules are densest.

| Area | Coverage |
| --- | --- |
| Schema | Every invariant in §3.3, each asserted to fail for the right reason |
| Migration | The loop against a stored fixture per version; all four error cases; a deliberately corrupt fixture proving errors surface rather than being repaired |
| Serialization | Export → Import round-trip equivalence, and that Import assigns a new `id` |
| Repository | Against `fake-indexeddb`: save, get, list, delete, and loading a document written by an older schema |
| Business | Each rule-carrying action, including the rejections; that `toJS(doc)` contains no derived value; autosave debounce and flush-on-hide |
| UI | Storybook stories for the section components and every `ResponsiveDialog` state, plus interaction tests for the Feats & Traits CRUD flows |

Storybook uses a decorator that injects a `CharacterStore` built from a fixture, which is also how the bottom-sheet-versus-modal breakpoint gets reviewed without a device.

## 10. Tooling

| Concern | Choice |
| --- | --- |
| Build | Vite, TypeScript `strict` |
| Validation | Zod |
| State | `mobx`, `mobx-react-lite`, `mobx-utils` (for `deepObserve`) |
| Storage | `idb` |
| Routing | `react-router` |
| PWA | `vite-plugin-pwa` |
| Tests | `vitest`, `@testing-library/react`, `fake-indexeddb` |
| Stories | Storybook |
| Format | Prettier, with `.vscode/settings.json` setting `editor.formatOnSave` and pinning `esbenp.prettier-vscode` as the default formatter, plus `.editorconfig` |
| Lint | ESLint flat config: `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-mobx` (catches a missing `observer`), and `no-restricted-imports` for the layer boundaries of §2 |

## 11. Accepted risks and open items

**iOS storage eviction** is reduced by `storage.persist()` and Export, not eliminated. If it ever bites in practice, that is the argument for moving to a Tauri shell — and the repository interface is where that change lands.

**`journal: LongText[]` with index-as-day** means days cannot be skipped or labelled. Accepted as `Model.ts` specifies it.

**`list()` reads full documents.** Fine for a handful of characters; revisit only if it measurably matters.

## 12. Decision log

| Decision | Rationale |
| --- | --- |
| PWA + IndexedDB, not filesystem | No mobile browser supports user-visible file access; verified against BCD and caniuse |
| Export/Import + raw-JSON editor as first-class features | Restores the durability and hand-repair that a real file would give, on every platform |
| No local versioning | User's decision: versioning belongs to remote upload and restore only |
| Debounced autosave, no save button | A save button is forgettable on a phone and adds friction to every counter tick |
| `Model.ts` authoritative for fields | User's decision; the wireframe is a sketch |
| `Record` + explicit order arrays | User's decision; order arrays fix JSON's lack of key ordering |
| `AbilitiesItem.proficient` dropped | No referent in the rules, and the app computes nothing, so the flag would carry no information |
| MobX over Valtio | User preference and familiarity; cached `computed` values also cannot leak into the saved file |
| Plain observable document + facade | Avoids a hydrate/dehydrate layer between classes and a plain-JSON document |
| Zod + hand-written migration loop | No maintained library for versioned document migration exists; the loop is ~15 lines and each migration stays a testable pure function |
| Hub-grid navigation | User's decision: keep the prototype's model |
| Bottom sheet on phone, modal on PC | A centred modal has ~145px with the keyboard up; one component covers both, so PC keeps the prototype's dialog |
| Vertical slice first | Proves every layer and every hard pattern once, before the six remaining sections repeat it |
