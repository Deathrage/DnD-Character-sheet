# Diagnostics log — Design

An opt-in log of slow moments, recorded on the player's phone and downloaded as a file, so a lag
that only happens there can be debugged here.

Status: **designed 2026-11-22**, not built.

## 0. Why

A player reported that pressing ‹ on the Spell List of an installed copy on an Android phone
sometimes froze the app for a few seconds before the hub appeared. It could not be reproduced:

- In headless Chromium 157, at a 6× CPU throttle, the same press took 100–268 ms from tap to
  hub. Characters with 17 and 317 spells, every category open, production and dev builds alike.
  No task was over 50 ms.
- Also ruled out:
  - edits just before the press: autosave's whole-document validation is 0.5–0.9 ms
  - `history.back()`, and a relaunch straight onto the Spell List
  - Firebase loading on the first sheet open
  - a memory leak: the heap stayed flat over 100 round trips
  - fonts: all are `font-display: swap`

What is left happens only on the phone, and only sometimes. This log records it there.

## 1. Decisions

| Decision | Choice | Whose |
|---|---|---|
| Platform | **Chrome on Android.** Uses the Long Animation Frames API (slow frames, with the scripts that ran in them) and the Event Timing API (slow taps). Neither exists in Safari; where they are missing, only the app's own entries are recorded | User |
| Getting the log out | **Download only**, a `.json` file saved like Export as `.json`. Nothing is ever sent anywhere | User |
| Lifetime | **Until turned off.** The switch and the log both survive closing and relaunching the app | User |
| Size | **The newest 2,000 entries**, the oldest deleted first: roughly 1–2 MB | Author |
| Switch | **A Diagnostics row in the character list's menu**, opening a dialog | User |
| Approach | **Browser performance entries plus the app's own timings, in a separate IndexedDB database** (approach A). Rejected: Chrome's JS Self-Profiling API (needs a new Hosting header and profiles continuously; kept in reserve if A's attribution is not enough), and storing the log in localStorage (every save rewrites the whole log on the main thread, so the logger would cause the jank it measures) | User, from three |
| Content | **Timings and which part of the app was busy. Never what is on a sheet** (§2) | User approved |

## 2. What is recorded

Every entry has `kind`, `at` (wall-clock ISO time, so the player can say "around 20:15") and `t`
(milliseconds since this launch's time origin, `performance.now()`'s clock).

| Kind | When | Fields |
|---|---|---|
| `session` | once when recording starts: at launch while on, or when switched on | `build` (the entry script's file name, e.g. `index-B3x9.js`), `userAgent`, `deviceMemory`, `hardwareConcurrency`, `viewport` (`{ width, height, dpr }`), `standalone` (`display-mode: standalone` matches), `navigation` (`navigate`, `reload` or `back_forward`), `controlled` (a service worker controls the page), `supports` (`{ frames, inputs }`: whether the two entry types exist) |
| `frame` | every `long-animation-frame` entry Chrome reports (all are over 50 ms) | `duration`, `blockingDuration`, `renderStart` and `styleAndLayoutStart` (relative to the frame's start), `route` (§2.1), `heap` (`performance.memory.usedJSHeapSize`, absent where it does not exist), `scripts`: up to 10, longest first, each `invokerType`, `invoker` (§2.2), `sourceURL` (path only, no origin), `sourceFunctionName`, `sourceCharPosition`, `duration`, `forcedStyleAndLayoutDuration`, `pauseDuration` |
| `input` | one per interaction whose longest `event` entry is at least 100 ms (`durationThreshold: 100`) | `name` (`pointerdown`, `click`, `keydown`…, from the longest entry of the interaction), `duration`, `inputDelay` (`processingStart − startTime`), `processing` (`processingEnd − processingStart`), `presentationDelay` (the rest), `target` (§2.2), `route` |
| `route` | every `hashchange` | `from` (the route the recorder last saw, read from `location.hash` when it started) and `to` (§2.1), `toNextFrame` (`hashchange` to the next `requestAnimationFrame` callback), `toFrameDone` (to a task queued from that callback, i.e. after the frame) |
| `lifecycle` | `visibilitychange`, `pagehide`, `pageshow`, `freeze`, `resume`, and `controllerchange` on the service worker container | `event`, plus `persisted` for `pagehide` and `pageshow` and `state` for `visibilitychange` |

Event entries with `interactionId` 0 (hover, pointer enter and leave) are not interactions and are
ignored. The several entries of one interaction (`pointerdown`, `pointerup`, `click`) share an
`interactionId` and become one `input` entry.

### 2.1 Routes

A route is recorded as `parseRoute`'s result **without the id**: `{ name: 'character', section:
'spells' }`, `{ name: 'legal', page: 'privacy' }`, `{ name: 'list' }`. Which character is not
needed to debug a frame, and the id is the one stable identifier in the app.

### 2.2 Never anything typed

Nothing from a sheet reaches the log: no names, descriptions, numbers or ids.

- An element (`input.target`) is described as its lower-case tag and class list,
  `button.back`, and never by its text or `aria-label`, which name spells and items
  (`Fire Bolt prepared`).
- A frame script's `invoker` comes from Chrome as tag, id and event (`BUTTON#b.onclick`). It is
  cut at the first `[`, because Chrome may append `[src=…]` for an image and a portrait's `src`
  is the portrait, and then to 100 characters. The ids in this app are fixed strings
  (`new-spell-name`) or React's `useId`, never content.

## 3. Architecture

`src/ui/diagnostics/`, beside `theme.ts` and `install.ts`: browser instrumentation, not character
data, so it is not routed through `data` and `business`. Nothing in `business` or `data` imports
it, and the lint boundaries are unchanged.

| File | Job |
|---|---|
| `entries.ts` | Pure functions from browser entries to §2's log entries: script selection and order, invoker and target sanitising, route without id, the input split. Testable with plain objects |
| `logStore.ts` | The IndexedDB database (§4): `append(entries)`, `readAll()`, `count()`, `clear()`, and the cap |
| `recorder.ts` | `start()` and `stop()`: the two `PerformanceObserver`s, the listeners, the in-memory buffer and its writes (§4). Its globals (`PerformanceObserver`, `requestAnimationFrame`, the event target, the store, the clock) are injectable for tests |
| `index.ts` | The only way in: `startIfOn()` and `useDiagnostics()` |

- **The switch** is one localStorage key, `diagnostics:on`, through `readPersisted` and
  `writePersisted` (`src/ui/persistedState.ts`).
- **`main.tsx` calls `startIfOn()`** before the first render. When the switch is on it loads
  `recorder.ts` with a dynamic `import()` and starts it, so with recording off the observers and
  the buffer are never loaded; `index.ts`, `logStore.ts` and the dialog are small and stay in the
  main bundle (`idb` is there already, for the characters). The observers use `buffered: true`,
  so frames from page load that happened before the import settled are still delivered.
- **`useDiagnostics()`** returns
  `{ view: { on, count, since }, refresh(), setOn(on), logFile(), clear() }`. `logFile()` hands
  back `{ filename, text }` (or null if the log could not be read), and `App` saves it: the DOM
  download stays with the other browser affordances in `App`. `count` and
  `since` (the oldest entry's `at`) are read by `refresh()`, which writes the buffer first.
  `App` calls it when the menu opens (its existing `onOpenMenu`), and each action calls it
  after. They are not live: the menu is open for seconds.

## 4. Storage

- **A database of its own, `dnd-diagnostics`**, version 1, one object store `entries` created
  with `autoIncrement: true` and no `keyPath`: out-of-line generated keys, for the same reason
  the characters store never reads a key from a value (AGENTS.md, "IndexedDB uses out-of-line
  keys"). Not a store in the characters database: adding one there bumps its `DB_VERSION`,
  which waits on every other open tab and locks older builds out. A debugging tool must not risk
  that.
- **Writes are batched.** Entries collect in memory and are appended in one transaction every
  2 s while there are any, and at once on `visibilitychange` to hidden and on `pagehide`:
  Android may kill a hidden app with no further event.
- **The cap.** After each append, if the store holds more than 2,000 entries, the oldest keys
  beyond that are deleted in the same transaction.
- **Best effort.** A failed open or write drops that batch with one `console.warn`. It never
  reaches `StorageGate`'s failure banner, which is about characters, and never throws into the
  app. The one promise (a document is never silently altered) is about character documents;
  this log is not one.
- **Off** disconnects the observers and listeners, writes the buffer and keeps the log, so it can
  still be downloaded. **On** again starts with a new `session` entry.

## 5. UI

- **Menu.** A new group in `CharacterList`'s menu, above Privacy Policy and Terms of Use, with
  one `MenuItem`: **Diagnostics**, a new pulse-line icon in `ICONS`, and the line
  "Record slow moments for the developer." when off, "Recording · 134 entries" when on. It
  closes the menu and opens the dialog, as the other items do (`fromMenu`).
- **The dialog**, `ResponsiveDialog` titled **Diagnostics**:
  - a `CheckRow` **Record slow moments**
  - a hint: "Records how long screens and taps take, and which part of the app was busy.
    Nothing you type into a sheet is recorded. The log stays on this device until you download
    it."
  - a status line: "134 entries since 22 Nov, 18:03" (`formatWhen`), or "Nothing recorded yet."
  - footer: **Download log**, primary, disabled while the log is empty; **Clear log** through
    `ConfirmDelete`, what "The diagnostics log"
- **`CharacterList` stays presentational**: it takes a `DiagnosticsView` and the three callbacks
  as props; `App` supplies them from `useDiagnostics()`. Absent hides the row, as `account` does.
- **The file** is `dnd-diagnostics-YYYY-MM-DD.json`, dated the way `exportFilename` dates a
  character (`toISOString().slice(0, 10)`):

  ```json
  { "format": 1, "exportedAt": "2026-11-22T18:03:11.402Z", "entries": [ … ] }
  ```

  Entries oldest first, the buffer flushed before reading. Saved by `App`'s `download()`, which
  changes from taking a `CharacterFile` to taking any `{ filename, text }`.

## 6. Privacy page

"Storage on your device" in `src/ui/screens/Legal.tsx` gains one sentence: Diagnostics is off
unless you turn it on in the menu; while on, the app keeps a log of timings (how long screens and
taps take, and which part of the app was busy, never what you typed) in IndexedDB, and it
leaves your device only if you download it. `UPDATED` becomes the release date, as the comment
above it requires.

## 7. Reading a log

Script positions point into the minified bundle. To map them: check out the commit that was
deployed, build with hidden source maps (`npx vite build --sourcemap hidden --outDir <dir>`:
hidden adds no `sourceMappingURL` comment, so the JS, and with it the hashed file name, should
match the deployed build), confirm the entry script's file name equals the log's
`session.build`, and look `sourceCharPosition` up in the matching `.map`.
No tooling for this ships; the first log is mapped by hand, and a script is written only if that
proves tedious.

## 8. Testing

Colocated, and each test proved to bite (AGENTS.md): break what it guards, watch it alone fail.

- **`entries.ts`**: a frame entry keeps its 10 longest scripts, longest first; `invoker` is cut at
  `[` and to 100 characters; `sourceURL` loses its origin; a target is tag and classes only, never
  `aria-label` or text; a route never carries an id; the input split adds up to `duration`;
  interactions with id 0 are dropped and one interaction's entries become one.
- **`logStore.ts`** (fake-indexeddb): entries read back oldest first; the cap deletes the oldest
  (an injectable cap, so the test does not write 2,000); `count` and `clear`.
- **`recorder.ts`** (fake observers, fake store, fake timers): a batch every 2 s; an immediate
  write on hidden and on `pagehide`; `stop()` disconnects and writes what is left; a store that
  rejects never throws out of the recorder; a `route` entry is timed from `hashchange` to the
  next frame.
- **`index.ts`**: `startIfOn()` loads the recorder only when the switch is on.
- **The dialog and the menu row**: the row's line off and on; Download disabled while empty;
  Clear asks first.

## 9. Verification in Chromium

Before it is called done, on a production build (`vite build` and `vite preview`):

- switch recording on from the menu, open a character's Spell List, force a 300 ms frame, press
  ‹, and download the log: it has a `session`, a `route` entry for `character/spells → character`
  and a `frame` entry whose script is named
- search the downloaded file for the character's name and its spell names, and find none
- the back press at a 6× throttle with recording off and on: the same within noise
- map one script position back to its source file and line by §7, so a log from the phone is
  known to be readable

AGENTS.md gets a short entry under "Current state".

## 10. Out of scope

- iPhone and Safari attribution: neither API exists there. The app's own `route` and
  `lifecycle` entries still record.
- Sending the log anywhere: download only, by decision.
- The JS Self-Profiling API: in reserve, if a log shows long frames whose scripts do not explain
  them and more detail is needed.
- A source-map lookup script (§7).
