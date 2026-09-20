# Business layer — Design

Supersedes parts of `2026-07-25-dnd-character-sheet-design.md`. Where the two disagree, this
document wins for everything it covers; the older spec remains authoritative for the UI (§7), the
PWA, tooling and the storage rationale (§5).

Amended there: **§3.2** (document shape), **§3.3** (invariants), **§3.4** (ordering), **§6**
(business layer, replaced entirely), **§8** (the first slice is abandoned — see §1 below), and
**§11** (one accepted risk is retired).

## 1. What changed and why

Two decisions drive this document.

**The first slice is abandoned.** The original plan wired one section of seven through all three
layers. Instead the data and business layers are built whole, for all seven sections, and the UI
follows against a finished interface. The business layer is what the UI depends on, so getting it
wrong is expensive to discover one section at a time.

**The UI never touches the document.** In §6 the document was public and most edits were direct
field writes. Here the document is private and unreachable, and every read and write goes through a
business object. The reason is not tidiness. Autosave validates and then **refuses loudly** on
failure, so the moment the in-memory document violates the schema, saving stops for that character
until something repairs it. Direct mutation has many ways to trip that, and none of them announce
themselves at the call site:

```ts
doc.classes['Wizard'].name = 'Warlock'          // key no longer equals name -> every save refused
doc.name = ' Sable '                            // padded; the schema rejects, never trims
doc.journalAndNotes.journal.splice(0, 1)        // deletes an old day; only the newest is deletable
delete doc.featsAndTraits.categories['Combat']  // its items vanish from the file, silently
doc.updatedAt = '...'                           // retriggers deepObserve; autosave loops
```

Each surfaces minutes later as "the app stopped saving", far from the code that caused it. The
business layer exists to keep the document continuously valid, because the persistence design has
no slack for anything else.

`Model.ts` is the shape this layer mirrors. It was always written as the business interface rather
than the storage interface: `level` is a getter, `attuned`/`equipped` are derived views, and the
journal's append-only rule is stated in a comment.

## 2. Schema v1 restructure

v1 is **edited in place, not superseded by a v2**. `src/data/schema/README.md` puts the freeze at
the moment a version could have written a document someone still has — a build has shipped, or real
data exists. Neither has happened; there is no build at all. So no migration function is written and
the migration loop stays exercised by its synthetic three-version test world, as designed.

### 2.1 Ids

Every item that lives in a list gains a required `id` field, validated by the existing `uuid`
primitive: inventory items, weapons, other equipment, spell-list entries, counters, feats and
traits, classes, and categories.

**The business layer mints every id**, from a single `createId()` in `src/business/`, imported
directly by the few files with an `add` method. The data layer never generates one: a blank document
contains only empty collections, so no item id exists until the business layer creates an item.
`createCharacter`'s injected `id` and `now` are unchanged; the library supplies them.

It is **not injectable**, which is a deliberate departure from `createCharacter`'s pattern. Injection
would buy deterministic ids in tests, and the business tests barely want them — rule tests use
whatever id `add()` returned, and the few assertions that deep-compare `toDocument()` can ignore ids
or mock the module. That is cheaper than threading a constructor parameter through sixteen classes.

One function is also the only sane place for a fallback: **`crypto.randomUUID()` exists only in a
secure context.** Over plain HTTP — a phone hitting `http://192.168.x.x:5173` on the LAN, which is
how a mobile-first PWA actually gets tested — it is `undefined`. Sixteen injection sites would each
be a place to forget that.

It lives in `src/business/`, not `src/shared/`: shared is for what more than one layer uses, and
only business mints ids.

Consequence to surface in the UI: `id` is required, so a hand-written document in the raw-JSON
editor must carry ids or it is rejected. Backfilling a missing id would be exactly the silent repair
the data layer refuses to perform, so the editor's error message must say plainly that ids are
required rather than appearing to fault the player's JSON for something invisible.

### 2.2 Name-keyed maps become arrays

```ts
classes: [{ id, name: 'Wizard', level: 3 }]

featsAndTraits: {
  categories: [{ id, name: 'Combat', items: [{ id, name, description }] }],
  uncategorized: [{ id, name, description }],
}
```

`Categorized<T>` changes shape identically for `featsAndTraits`, `spellList` and `counters`.

This deletes, rather than relocates, four things:

| Deleted | Was |
| --- | --- |
| The `classes` key-equals-`name` `superRefine` | A document-level rule in `document.ts` |
| `renameClass`'s one-pass rebuild | Required so a rename did not move the entry last |
| `renameCategory`'s one-pass rebuild | Same |
| §11's numeric-name ordering risk | A category named `12` sorted ahead of every other |

Rename becomes `setName`, a plain field write. Order becomes explicit array position rather than
ECMAScript's insertion-order guarantee for string keys, so §3.4's argument no longer load-bears, and
user-controlled reordering becomes a splice instead of "reintroducing an explicit order array".

### 2.3 What stays keyed

| Field | Stays a `Record`/fixed-key object because |
| --- | --- |
| `inventory.coins` | Closed set of five; the keys are the identity |
| `abilities`, `skills` | Closed sets; the keys are the identity |
| `counters.spellSlots` | Closed set, levels 1–9 |
| `hitDices` | Not a closed set — the player adds die types — but the key is the die *size*, which is the identity and is never renamed. Numeric keys also iterate in ascending numeric order, which is the desired display order (d4, d6, d8, d12, d20) |
| `journalAndNotes.journal` | `string[]`; `Model.ts` defines the index *as* the day index, and the only mutations are append-at-end and delete-newest, so positions never shift |

### 2.4 Id uniqueness

A new document-level `superRefine` requires ids to be **unique across the whole document**,
implemented as an explicit table of collection accessors rather than a recursive walk, so the
reported path names the collection. The character's own `doc.id` does not participate: it is the
IndexedDB store key, not a member of any collection.

This is a real corruption vector now that the raw-JSON editor can produce one, and a silent one —
duplicate ids make edits and deletions land on the wrong item rather than failing.

### 2.5 Duplicate names become representable

Two classes named "Wizard", or two categories named "Combat", were unrepresentable while the name
was the key. They are now merely unusual.

**The schema permits them; the business layer prevents them** on `add` and `setName`. Rejecting a
whole document over two same-named categories is the kind of disagreement with the player this app
exists to avoid, and the raw-JSON editor is deliberately a power-user escape hatch.

### 2.6 No calculated properties are stored

Checked, and there are none to remove. §3.1 already excludes all three derived values — `level`,
and the `attuned`/`equipped` views — as "never stored in the file".

`modifier`, `savingThrowModifier`, `proficiencyBonus` and `passivePerception` look derived, and in
the rules they are. They are player-entered on purpose and **stay stored**. Computing them is the
single thing this app exists not to do.

## 3. Business object conventions

### 3.1 Naming

| Kind | Form | Example |
| --- | --- | --- |
| Business object | `*BO` | `FeatBO`, `CategoryBO`, `CharacterSheetBO` |
| Stored shape | `*Data`, **never exported** from `src/business/` | `type FeatData = { id, name, description }` |
| Creation input | `New*` | `type NewFeat = { name: string; description?: string }` |

The `BO` suffix is for the reader who is new to a file: what they are looking at is legible without
tracing an import. It resolves from the directory name (`src/business/`) and the vocabulary
AGENTS.md already uses. `ViewModel` is the more accurate pattern name but implies a UI coupling this
layer deliberately does not have, and costs nine characters instead of two.

`*Data` is marked for the same reason rather than left as a bare noun. A convention whose members
are identified by the *absence* of a suffix has a hole exactly where a newcomer is looking, and one
silently-unmarked member is where conventions begin to erode. `*Node` would be more precise — these
are nodes in the document tree — but it overlaps with the DOM's `Node` in a browser app, and `Data`
pairs with `BO` at a glance, which is the property being bought. `NewFeat` does not become
`NewFeatData`: it names its purpose rather than its layer, which is why it needs no layer mark.

**A `*Data` type is not a data-layer export.** `src/data/` names no per-item types at all — its item
schemas are unexported `const`s. Each `*Data` is a business-internal alias for a slice of
`CharacterDocument`:

```ts
type InventoryData = CharacterDocument['inventory']
type FeatData = CharacterDocument['featsAndTraits']['uncategorized'][number]
```

The data layer's own exported types — `CharacterDocument`, `CharacterSummary`, `ListEntry`,
`LoadError`, `LoadResult`, `ParseTextResult`, `SchemaIssue` — keep their role names unchanged. They
are already named for what they are, which is this repo's established habit, and
`CharacterDocumentData` would be worse than what it replaced.

Collections take the document's own field name, so `hitDices` stays `hitDices`. Renaming a schema
field to correct its English is not worth the churn.

### 3.2 Methods

| Kind | Form | Example |
| --- | --- | --- |
| Scalar write | `setX(value)` | `setName`, `setLevel`, `setTemporary` |
| Create | `add(init)`, returning the new object | `category.add({ name: 'Rage' })` |
| Destroy | `remove()` **on the object itself** | `feat.remove()`, `category.remove()`, `entry.remove()` |
| Relocate | `moveTo(target)` | `feat.moveTo(category)` |
| Derived value | plain noun getter | `level`, `attuned`, `equipped` |

Self-removal is uniform: every business object holds its parent, so `parent.remove(child)` never
appears and there are not two spellings of one idea.

**One named setter per field** — roughly 150 call sites but only about 45 written methods, because
`SkillBO` is written once and instantiated eighteen times, and `AbilityBO` once and instantiated
six times. Writes arrive one field at a time as the player types (§7, "fields write through store
actions on change"), so a patch object would allocate per keystroke to express a single assignment.

### 3.3 Encapsulation

The document lives in a `#doc` **private field**, not a TypeScript `private` one. `private` is
erased at compile time — a cast, or plain JavaScript, reaches straight through it. `#` is enforced
by the runtime. Since the whole purpose of this layer is that the UI cannot reach the document,
compile-time-only enforcement would not deliver it.

### 3.4 Base classes

```ts
abstract class NodeBO<TData>                              // holds its parent and its node
abstract class NamedItemBO<TData> extends NodeBO<TData>   // name, setName, description,
                                                          // setDescription, moveTo(category), remove()
```

`FeatBO`, `SpellBO`, `CounterBO`, `InventoryItemBO` and `EquipmentItemBO` all extend
`NamedItemBO` — five subclasses, so the abstraction is reuse rather than speculation.

**A business object holds its node directly.** An earlier draft had every object resolve itself by
id on each access, to survive a document swap orphaning it. That was over-built: nothing swaps a
document in place — see §4 — so the tree a sheet is built with is the tree it keeps until disposal.
`GONE` survives as an assertion inside `remove()` — removing something twice is a bug worth hearing
about — rather than as a check on every read.

### 3.5 MobX

Business objects carry **no MobX annotation at all**. They hold a parent reference and a node, both
assigned once. All observability comes from the single `observable(doc)` inside `CharacterSheetBO`,
which every object reads through.

So there is no `makeAutoObservable` in sixteen classes, and no interaction between MobX and `#`
fields to get wrong. Derived values are plain getters; `computed` is an optimisation to add only if
something measures slow.

`toJS(#doc)` remains literally the file. The rule that keeps it true: **a business object holds a
reference to its node and never a copy of a value.** Cache a name or mirror a list once, and memory
and file can disagree — which is the class of bug this codebase has been built to avoid.

### 3.6 Guards and errors

```ts
class RuleViolation extends Error { readonly code: RuleCode }

type RuleCode =
  | 'DUPLICATE_NAME' | 'EMPTY_NAME' | 'DUPLICATE_DIE'
  | 'NOT_AN_INTEGER' | 'NEGATIVE' | 'UNKNOWN_CATEGORY' | 'GONE'
```

Writes that break a rule **throw**. One mechanism, not two: most codes mean a UI bug and should be
loud, and the one the UI must present to the player — a duplicate category name, acceptance
criterion 6 — it catches at the call site where it already expects it.

Names are **trimmed** by every setter that writes one, and rejected when empty afterwards. This is
the write boundary the schema's no-trim rule defers to.

Numbers are **guarded, not validated**. The UI contract is that a numeric input holds its half-typed
string as local state and calls the setter only when the text parses, so `''`, `-` and `1e` never
reach this layer. The guards therefore catch bugs, not keystrokes.

## 4. The object tree

```ts
class CharacterSheetBO {
  constructor(doc: CharacterDocument)
  readonly id: string
  get name(): string;        setName(v: string): void
  get level(): number                                   // derived, never stored
  get armorClass(): number;  setArmorClass(n: number): void
  readonly classes: ClassesBO
  readonly hitPoints: HitPointsBO                       // setCurrent / setTotal / setTemporary
  readonly hitDices: HitDicesBO
  readonly journalAndNotes: JournalAndNotesBO
  readonly inventory: InventoryBO                       // .coins, .items
  readonly featsAndTraits: CategorizedBO<FeatBO>
  readonly equipment: EquipmentBO                       // .weapons .other + derived .attuned .equipped
  readonly spellList: CategorizedBO<SpellBO>
  readonly counters: CountersBO                         // CategorizedBO<CounterBO> + .spellSlots
  readonly abilitiesAndSkills: AbilitiesAndSkillsBO
  toDocument(): CharacterDocument                       // toJS — this is the file
  dispose(): void                                       // drops any pending save; sheet is dead after
}
```

**There is no `replaceDocument`.** An earlier draft had one, as a deliberate wide door for the
raw-JSON editor. It cannot be made safe: every sub-BO holds its node directly (§3.4), so swapping the
document orphans all sixteen of them at once, and writes through any the UI still holds would land on
the old tree and never reach the file. Making it safe means rebuilding the whole sub-BO tree, which
is what the constructor already does — so the method reduces to a worse spelling of
`new CharacterSheetBO(doc)`. The reasoning for it was also circular: §3.4 drops resolve-by-id
*because* a document swap remounts the tree, which is exactly why nothing needs to swap in place.

The raw-JSON editor instead takes the replacement path, and the **order matters**:

```
text → parseCharacter → sheet.dispose() → repository.save(doc) → library re-opens → a new sheet
```

`dispose()` first, and it **discards** the pending save rather than flushing it. Flushing would write
the old in-memory document over the JSON the player just committed; not disposing at all would let
the debounce fire after the write and do the same thing a moment later. This is the one place where
`dispose` and `flush` mean opposite things, which is why they are separate methods — everywhere else
(`pagehide`, `visibilitychange`) the last edit must be saved, not dropped.

```ts
class CategorizedBO<TItemBO> {           // written once; serves feats, spells and counters
  get categories(): CategoryBO<TItemBO>[]
  get uncategorized(): TItemBO[]
  createCategory(name: string): CategoryBO<TItemBO>   // rejects empty and duplicate
  add(init): TItemBO                                  // lands in uncategorized
}

class CategoryBO<TItemBO> {
  get id(): string
  get name(): string;  setName(v: string): void       // plain write; array position is preserved
  get items(): TItemBO[]
  add(init): TItemBO
  remove(): void                                      // moves items to uncategorized first
}

class FeatBO extends NamedItemBO<FeatData> {      // and SpellBO, CounterBO, InventoryItemBO,
  // name, setName, description, setDescription,  // EquipmentItemBO
  // moveTo(category | null), remove()
}
```

Collections carrying rules:

| Object | Rules |
| --- | --- |
| `ClassesBO` | `add` and `setName` reject a duplicate name |
| `HitDicesBO` | `add(size)` rejects a size already present; `HitDieBO.remove()` deletes the key |
| `JournalAndNotesBO` | `appendDay()` appends at the end only; `deleteNewestDay()` deletes the last entry only, and no other index is deletable |
| `CategorizedBO` | `createCategory` rejects empty and duplicate names |
| `CategoryBO` | `remove()` moves its items to `uncategorized` before deleting the category |
| `NamedItemBO` | `moveTo` keeps `categories` and `uncategorized` mutually exclusive |

Everything else in the tree is assignment behind a guard.

A `New*` input omits every field the schema requires but the player has not supplied yet:
`add({ name: 'Rage' })` fills `description` with `''` and `id` from `createId()`. Defaults are the
blank-document values from `createCharacter`, never a guess.

## 5. Library, files, storage

The library deals in characters. Anything about *text*, or about *error copy*, lives elsewhere —
that is what keeps `importText`, `exportText` and `describe` off it.

```ts
class CharacterLibraryBO {
  get entries(): CharacterEntryBO[]      // observable; empty until load() resolves
  load(): Promise<void>                  // repository.list() -> entries
  create(name: string): Promise<CharacterSheetBO>
  add(file: CharacterFile): Promise<CharacterSheetBO>
}
```

`create` is the only path the UI uses to make a character, so it never handles a
`CharacterDocument`. Every method here is an instance method: they need the repository and they
mutate `entries`.

```ts
// inside CharacterLibraryBO.create(name)
const doc = createCharacter({ name, id: createId(), now: new Date() })
await repository.save(doc)          // written before any edit, so the row exists immediately
const sheet = new CharacterSheetBO(doc)
this.#entries.push(new CharacterEntryBO(summarize(doc), this))
this.#attachAutosave(sheet)
return sheet
```

Both trailing steps are load-bearing and neither is optional:

- **The entry is pushed, not awaited from a reload.** Without it the list is stale until the next
  `load()`, and the character the player just created is missing from it — acceptance criterion 1.
- **Autosave is attached here, not only in `open()`.** `create` hands back a live sheet, so without
  it every edit to a newly created character is silently lost until the player navigates away and
  back.

`add(file)` does exactly the same three things after `repository.save`, and is the reason they are
written as a shared private step rather than inlined twice.

The constructor stays public rather than hiding behind a `static blank()`, because `open()`, tests
and Storybook fixtures all already hold a document. A `blank()` would only wrap `createCharacter`,
and a test that reads `createCharacter(...)` then `new CharacterSheetBO(doc)` says more than one
that reads `CharacterSheetBO.blank(...)`.

```ts

class CharacterEntryBO {
  get id(): string
  get name(): string
  get totalLevel(): number
  get classes(): { name: string; level: number }[]
  get hitPoints(): { current: number; total: number; temporary: number }
  get isDamaged(): boolean
  get problem(): string | null      // the error describing itself; no `describe` method anywhere
  open(): Promise<CharacterSheetBO | LoadError>
  remove(): Promise<void>           // same self-removal convention as feat.remove()
}

class CharacterFile {
  static read(text: string): CharacterFile | ParseFailure
  static of(sheet: CharacterSheetBO, now: Date): CharacterFile
  get filename(): string
  get text(): string
}
```

`CharacterFile` is why `CharacterDocument` never appears in a UI-facing signature: the file is the
opaque token the UI carries from "the player picked a file" to `library.add(file)`.

Export from the list screen is `entry.open()` then `CharacterFile.of(sheet)` — two steps, but the
same path whether or not a sheet is already open, instead of one method per case.

A damaged row still appears in the list, flagged, and opens in the raw-JSON editor seeded with its
raw stored text (acceptance criterion 15). `describeLoadError` is re-exported by
`src/business/errors.ts` because `ui` may not import `data`; it stays a function, and
`entry.problem` is its only caller.

```ts
class StorageBO {                                // app-global, not per character
  get persistence(): 'unknown' | 'granted' | 'denied' | 'dismissedForSession'
  requestPersist(): Promise<void>
  dismissForSession(): void
  get failure(): StorageFailure | null
  clearFailure(): void
}
```

The persistence gate drives acceptance criteria 13 and 14: a blocking dialog covers the character
list while `persisted()` reports false, with no close button, no scrim dismissal and no Escape; a
refusal explains installing the app and exporting, and offers a session-only dismissal so the app is
never left unusable.

## 6. Autosave

```
deepObserve(#doc) → debounce 500ms → toDocument() → stamp updatedAt on the plain copy
                  → validate against CURRENT_SCHEMA → repository.save()
                  + forced flush on pagehide and on visibilitychange → hidden
```

`updatedAt` is stamped on the copy and **never** written back to the observable document; writing it
back retriggers `deepObserve` and loops forever.

A validation failure **refuses the write** and surfaces `SAVE_REFUSED` prominently. That condition
means a business-layer bug, so it must be loud rather than silently retried. With §3.6's guards in
place it should be unreachable, which is precisely why reaching it must be visible.

```ts
class Autosave {
  constructor(sheet: CharacterSheetBO, repository: CharacterRepository,
              options?: { debounceMs?: number; now?: () => Date })
  start(): void
  stop(): void
  flush(): Promise<void>
}
```

Attached by whoever opens a sheet. `debounceMs` and `now` are injectable so the debounce and the
`updatedAt` stamp are assertable without timers or a wall clock.

No undo stack and no local revision history. Both stay cheap to add later against a single-document
model.

## 7. Data-layer work folded in

All of it comes from `plans/2026-07-25-data-layer-followups.md`.

**Storage failures become typed**, replacing the raw `DOMException`s that escape today. The type
lives in `data/repository/`, because the repository is what knows, and is re-exported through
business for the UI:

```ts
type StorageFailure =
  | { code: 'QUOTA_EXCEEDED' }
  | { code: 'UNAVAILABLE'; cause: unknown }       // private browsing, or IndexedDB blocked
  | { code: 'BLOCKED' }                           // another tab pinning an old version
  | { code: 'SAVE_REFUSED'; issues: SchemaIssue[] }
  | { code: 'UNKNOWN'; cause: unknown }
```

`openDb` gains `blocked`, `blocking` and `terminated` callbacks, so an installed PWA with a second
tab open cannot block a future version bump indefinitely. `list()` awaits `tx.done`, so an aborted
transaction with no in-flight request rejects `list()` instead of surfacing as an unhandled
rejection. §11 calls this area the sharpest risk in the design.

**An injectable `MigrationRegistry` on the repository.** `createIndexedDbRepository` takes
`{ registry?, openDb? }`, making "loading a document written by an older schema" — required coverage
under §9 — writable for the first time, and retiring `openDb` as exported production surface that
existed only as a test seam.

**Typing and tidy-ups.** `openDb` gains `idb`'s `DBSchema` type parameter so `cursor.value` stops
entering as `any`; `toJsonText` accepts `unknown` so it can pretty-print `getRaw()` for the repair
screen; the `createCharacter` fixture duplicated across six test files becomes one shared helper, as
does `wipe()`.

## 8. Testing

Per §9, plus for this layer. The project's TDD practice holds: tests first, and per AGENTS.md,
**every new test is proved to bite** — break what it guards, watch that test and only that test
fail, restore.

| Area | Coverage |
| --- | --- |
| Schema | Id uniqueness across the document; the array shapes; a strictness table row for every new object schema; that `classes` and `categories` preserve array order through a file round-trip |
| Repository | Older-schema load through the injected registry; each `DOMException` mapped to its `StorageFailure`; an aborted `list()` rejecting rather than escaping |
| Business rules | Every rule in §4's table, including each rejection; `RuleViolation` codes |
| Business invariants | `toDocument()` contains no derived value; setters trim names; guards throw on a non-integer or a negative |
| Autosave | Debounce coalesces a burst into one save; flush-on-hide; `updatedAt` stamped on the copy and absent from the observable document; a refused save surfaces `SAVE_REFUSED` and does not retry |
| Encapsulation | The document is unreachable from a `CharacterSheetBO` in plain JavaScript |

## 9. Decisions

| Decision | Alternative rejected | Why |
| --- | --- | --- |
| Business objects, not free functions over the document | A functional layer: observable document read directly under a `DeepReadonly` type, writes as free functions taking `doc` | The functional design is roughly 40% less code and has no staleness hazard, and it was seriously considered. Objects win on discoverability across a wide, shallow domain — seven sections, ~150 fields, ~8 actual rules — and on encapsulation the runtime enforces rather than the compiler. The ~45 setters cost the same either way |
| Full object tree | A hybrid: objects where rules live, direct readonly access for `coins`, `abilities`, `skills`, `spellSlots`, `hitPoints` | Deletes about twelve assignment-only classes, but makes "what am I looking at" situational, which defeats the reason the `BO` suffix exists |
| v1 edited in place | A v2 plus a migration | Nothing has shipped and no real data exists, so the freeze has not begun. A migration for documents that do not exist is invented work |
| Ids minted by the business layer | Minted in the data layer's factories | The data layer only ever builds empty collections; no item exists there to identify |
| Import keeps item ids, reassigns only the document id | Reassigning every id on import | Item ids are scoped within their document, so a collision across two characters is meaningless |
| Schema permits duplicate names, business prevents them | A schema uniqueness rule | Rejecting a whole document over two same-named categories is the disagreement with the player this app avoids; the raw-JSON editor is deliberately an escape hatch |
| Objects hold their node | Resolve by id on every access | Over-built. Nothing swaps a document in place, so no node orphans while its sheet is alive |
| No `replaceDocument` | A wide door for the raw-JSON editor | It orphans all sixteen sub-BOs at once, and making it safe means rebuilding them — which is the constructor. The editor disposes the sheet and re-opens instead |
| One named setter per field | `set(field, value)`, or `update(partial)` | Explicitness for the reader, at ~45 written methods. Writes arrive one field at a time, so a patch object allocates per keystroke to express one assignment |

## 10. Open items

- **`CharacterEntryBO.open()` returns a bare `CharacterSheetBO | LoadError` union**, which is *not*
  the data layer's discriminated `LoadResult` shape, and which has no case for an id that has left
  the store since `load()`. Either it should mirror `LoadResult`'s `{ ok }` discriminant, or the
  missing-row case should be impossible by construction because the entry came from the list.
  Settle when the list screen is built; both readings are defensible and the UI will say which.
- **Where `Autosave` is attached.** `CharacterLibraryBO` owns it — `open`, `create` and `add` each
  attach, `sheet.dispose()` detaches. What remains open is the raw-JSON editor: it holds an
  invalid draft for as long as the player is typing, and disposing on entry means an unrelated
  navigation away loses nothing but also saves nothing. Settle with the raw-JSON screen.
- **`equipment.weapons` and `equipment.other` share the document-wide id space** but there is no
  `moveTo` between them. If moving a weapon to "other" is ever wanted, it is `NamedItemBO.moveTo`
  with a different target type.
