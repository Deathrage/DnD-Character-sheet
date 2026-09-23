import { observable } from 'mobx';
import { createIndexedDbRepository } from '../data/repository/indexedDbRepository.js';
import { StorageError, toStorageFailure } from '../data/repository/storageFailure.js';
import { summarize } from '../data/repository/summarize.js';
import type { CharacterRepository, CharacterSummary } from '../data/repository/types.js';
import { createCharacter, type CharacterDocument } from '../data/schema/index.js';
import { Autosave, type AutosaveOptions } from './autosave.js';
import { CharacterSheetBO } from './characterSheet.js';
import { CharacterFile, documentOf, parseInto } from './characterFile.js';
import { createId } from './createId.js';
import { describeLoadError } from '../data/migration/errors.js';
import { trimmedName } from './guards.js';
import './mobxConfig.js';
import { StorageGate } from './storageGate.js';

export interface CharacterLibraryOptions {
  /**
   * Defaulted rather than required, so `src/ui/` can build a library without naming a type from
   * `src/data/` — a boundary it may not cross (spec §2). Tests and Storybook inject.
   */
  repository?: CharacterRepository;
  storageGate?: StorageGate;
  /** Forwarded to every `Autosave` this library attaches; a test shortens the debounce. */
  autosave?: Pick<AutosaveOptions, 'debounceMs' | 'now' | 'target'>;
}

/**
 * The library deals in characters. Anything about *text* is `CharacterFile`'s, and anything about
 * error copy is `describeLoadError`'s — which is what keeps `importText`, `exportText` and
 * `describe` off this class (spec §5).
 */
export class CharacterLibraryBO {
  readonly #repository: CharacterRepository;
  readonly storageGate: StorageGate;
  readonly #autosaveOptions: Pick<AutosaveOptions, 'debounceMs' | 'now' | 'target'>;
  readonly #entries = observable.array<CharacterEntryBO>([], { deep: false });
  /** Every autosave currently attached, so `flush()` can await all of them. */
  readonly #autosaves = new Set<Autosave>();

  constructor(options: CharacterLibraryOptions = {}) {
    this.storageGate = options.storageGate ?? new StorageGate();
    this.#repository =
      options.repository ??
      createIndexedDbRepository({ onFailure: (failure) => this.storageGate.report(failure) });
    this.#autosaveOptions = options.autosave ?? {};
  }

  /** Observable, and empty until `load()` resolves. */
  get entries(): CharacterEntryBO[] {
    return [...this.#entries];
  }

  /**
   * Reports a whole-store failure rather than throwing it.
   *
   * This is not the codebase's "never swallow a failure" rule being broken — the failure is
   * surfaced, on the storage banner, which is where a player can act on it. What it must not do is
   * reject: the app awaits this before its first render, so a rejection left the screen on
   * "Loading…" for ever, which is exactly the silent failure the rule exists to prevent. An
   * individual damaged *document* is untouched by this and still comes back as its own `ok: false`
   * row (criterion 15).
   */
  async load(): Promise<void> {
    try {
      const rows = await this.#repository.list();
      this.#entries.replace(rows.map((row) => new CharacterEntryBO(row, this)));
    } catch (caught) {
      this.storageGate.report(
        caught instanceof StorageError ? caught.detail : toStorageFailure(caught),
      );
    }
  }

  /**
   * The only path the UI uses to make a character, so it never handles a `CharacterDocument`.
   */
  async create(name: string): Promise<CharacterSheetBO> {
    const doc = createCharacter({ name: trimmedName(name), id: createId(), now: new Date() });
    return this.#adopt(doc);
  }

  /** Import. Identical to `create` after the document exists, which is why both end in `#adopt`. */
  async add(file: CharacterFile): Promise<CharacterSheetBO> {
    return this.#adopt(documentOf(file));
  }

  /**
   * Both trailing steps are load-bearing (spec §5):
   *
   * - The entry is **pushed**, not awaited from a reload, or the list is stale until the next
   *   `load()` and the character the player just made is missing from it (criterion 1).
   * - Autosave is attached **here**, not only in `open()`, or every edit to a newly created
   *   character is lost until the player navigates away and back.
   */
  async #adopt(doc: CharacterDocument): Promise<CharacterSheetBO> {
    // Written before any edit, so the row exists immediately.
    await this.store(doc);
    const sheet = new CharacterSheetBO(doc);
    this.attachAutosave(sheet);
    return sheet;
  }

  /**
   * Public because `open()` on an entry needs it and entries live in this file — and because the
   * raw-JSON editor re-opens a sheet it disposed. It is absent from `src/business/index.ts`, so
   * no component can reach it.
   */
  attachAutosave(sheet: CharacterSheetBO): void {
    const autosave = new Autosave(sheet, this.#repository, {
      ...this.#autosaveOptions,
      onFailure: (failure) => this.storageGate.report(failure),
      onSaved: (doc) => this.#refreshRow(doc),
    });
    autosave.start();
    this.#autosaves.add(autosave);
    sheet.onDispose(() => {
      autosave.stop();
      // A leak guard, not behaviour, and deliberately not covered by a test: `stop()` has already
      // ended the reaction and flushed, so a later `flush()` over a stopped autosave is a no-op
      // whether or not it is still in this set. What the delete prevents is the set growing by one
      // for every character ever opened in a session.
      this.#autosaves.delete(autosave);
    });
  }

  /**
   * Writes every open sheet's pending edits now, and resolves once they have landed.
   *
   * `Autosave` already flushes on `pagehide` and on `stop()`, but both of those are fire-and-
   * forget — `dispose()` is synchronous by spec §4, so it cannot await a write. This is the
   * awaitable version, for a caller that needs the store to be current before it does something
   * else: the dev seed, and anything later that has to hand off to a reload or an export.
   */
  async flush(): Promise<void> {
    await Promise.all([...this.#autosaves].map((autosave) => autosave.flush()));
  }

  /**
   * Re-summarises one row from the document that was just stored.
   *
   * A row is a snapshot — that is the whole point of `CharacterSummary`, which exists so that
   * listing twenty characters does not parse twenty documents. But a snapshot taken when the
   * character was created says "No class · Level 0" forever: edit a sheet, go back to the list,
   * and the list contradicts the sheet until the next reload. Re-taking it on each save is the
   * cheapest way to keep them agreeing, because the document is already in hand here.
   */
  #refreshRow(doc: CharacterDocument): void {
    this.#entries
      .find((entry) => entry.id === doc.id)
      ?.refresh({ ok: true, summary: summarize(doc) });
  }

  /** Internal, for `CharacterEntryBO`. Not on `index.ts`. */
  get repository(): CharacterRepository {
    return this.#repository;
  }

  /**
   * Internal, for `#adopt` and `CharacterEntryBO.clone()`: saves a new document and lists it.
   * A clone gets no sheet, because nobody is looking at it yet and a sheet would need disposing.
   */
  async store(doc: CharacterDocument): Promise<void> {
    await this.#repository.save(doc);
    this.#entries.push(new CharacterEntryBO({ ok: true, summary: summarize(doc) }, this));
  }

  /** Internal, for `CharacterEntryBO.remove()`. */
  forget(entry: CharacterEntryBO): void {
    this.#entries.remove(entry);
  }
}

/** What `list()` returned for one row: a summary, or the reason that row would not parse. */
type EntryRow =
  | { ok: true; summary: CharacterSummary }
  | { ok: false; id: string; error: Parameters<typeof describeLoadError>[0] };

/**
 * One row of the character list. A damaged document still gets one (criterion 15): it is listed,
 * flagged, and openable in the raw-JSON editor.
 */
export class CharacterEntryBO {
  /**
   * Observable, and wrapped in an object rather than replaced as a field, so that `refresh`
   * updates the row **in place**. Replacing the entry in the library's array would work for the
   * list, which re-maps every render anyway, but it would change identity under anything holding
   * this entry — the raw-JSON screen keys an effect on it.
   */
  readonly #state: { row: EntryRow };
  readonly #library: CharacterLibraryBO;

  constructor(row: EntryRow, library: CharacterLibraryBO) {
    this.#state = observable({ row }, {}, { deep: false });
    this.#library = library;
  }

  /** Internal, for `CharacterLibraryBO`. Not on `index.ts`. */
  refresh(row: EntryRow): void {
    this.#state.row = row;
  }

  get id(): string {
    // Read from the summary the repository built, not re-derived from the document — `list()`
    // keys each row by its store key, which is the id that must be used to fetch it back.
    return this.#state.row.ok ? this.#state.row.summary.id : this.#state.row.id;
  }

  get name(): string {
    return this.#state.row.ok ? this.#state.row.summary.name : 'Unreadable character';
  }

  get totalLevel(): number {
    return this.#state.row.ok ? this.#state.row.summary.totalLevel : 0;
  }

  get classes(): { name: string; level: number }[] {
    return this.#state.row.ok ? this.#state.row.summary.classes : [];
  }

  get hitPoints(): { current: number; total: number; temporary: number } {
    return this.#state.row.ok
      ? this.#state.row.summary.hitPoints
      : { current: 0, total: 0, temporary: 0 };
  }

  get isDamaged(): boolean {
    return !this.#state.row.ok;
  }

  /** The error describing itself. There is no `describe` method anywhere (spec §5). */
  get problem(): string | null {
    return this.#state.row.ok ? null : describeLoadError(this.#state.row.error);
  }

  /**
   * Spec §10 left this returning a bare `CharacterSheetBO | LoadError` and asked the list screen
   * to settle it. The list screen is built, and it renders a row as `{ ok: true, ... }` or
   * `{ ok: false, message }` — so this mirrors the `{ ok }` discriminant the rest of the codebase
   * uses, and the row-has-since-vanished case the spec noted has no place to hide: it comes back
   * as an ordinary `ok: false` with a sentence, not as a `null` the caller may forget.
   */
  async open(): Promise<{ ok: true; sheet: CharacterSheetBO } | { ok: false; message: string }> {
    const result = await this.#library.repository.get(this.id);
    if (result === null) {
      return { ok: false, message: 'This character is no longer in this browser.' };
    }
    if (!result.ok) return { ok: false, message: describeLoadError(result.error) };

    const sheet = new CharacterSheetBO(result.doc);
    this.#library.attachAutosave(sheet);
    return { ok: true, sheet };
  }

  /**
   * The raw stored text, for the repair screen. Pretty-printed rather than handed over as it sits
   * in IndexedDB, because what sits there is a parsed structure, not text.
   */
  async rawText(): Promise<string> {
    const raw: unknown = await this.#library.repository.getRaw(this.id);
    return `${JSON.stringify(raw, null, 2)}\n`;
  }

  /**
   * Stores hand-edited text under *this* character's id, or returns the sentence saying why it
   * could not. The raw-JSON editor's commit; the only route by which a damaged document becomes
   * a readable one again (criterion 15).
   *
   * Beyond spec §5-6, which seeds the repair screen (`rawText`) but never says how a repair gets
   * written back. It is here rather than on `CharacterSheetBO` because a damaged document has no
   * sheet — that is what makes it damaged — so the entry is the only thing that exists to repair.
   *
   * It reloads the whole list rather than patching this row: a repair can change a row's name,
   * level and whether it is damaged at all, and a re-`list()` of a handful of characters is
   * cheaper to be right about than three assignments. The caller's `CharacterEntryBO` is stale
   * afterwards, which is why the editor returns to the list rather than staying open on it.
   */
  async repair(text: string): Promise<string | null> {
    const parsed = parseInto(text, this.id);
    if (!parsed.ok) return parsed.message;
    try {
      await this.#library.repository.save(parsed.doc);
    } catch (caught) {
      // A document the schema refuses never reaches the store, and the editor keeps the text —
      // which is often the only copy of the fix.
      if (caught instanceof StorageError && caught.detail.code === 'SAVE_REFUSED') {
        return caught.detail.issues
          .map((issue) => (issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`))
          .join('; ');
      }
      throw caught;
    }
    await this.#library.load();
    return null;
  }

  /**
   * Stores a copy of this character under a new id, named "… (copy)", or returns the sentence
   * saying why it could not. A damaged document is not cloned: repair it first, or the copy is
   * just a second damaged row.
   *
   * Collection item ids are kept — they only have to be unique within one document.
   */
  async clone(): Promise<string | null> {
    const result = await this.#library.repository.get(this.id);
    if (result === null) return 'This character is no longer in this browser.';
    if (!result.ok) return describeLoadError(result.error);

    // 73 + " (copy)" is the 80-character name limit.
    const name = trimmedName(`${result.doc.name.slice(0, 73).trimEnd()} (copy)`);
    await this.#library.store({
      ...structuredClone(result.doc),
      id: createId(),
      name,
      updatedAt: new Date().toISOString(),
    });
    return null;
  }

  /** Same self-removal convention as `feat.remove()`. */
  async remove(): Promise<void> {
    await this.#library.repository.delete(this.id);
    this.#library.forget(this);
  }
}

/** Re-exported for the one caller that has to tell a storage failure from a programming error. */
export { StorageError };
