import { reaction } from 'mobx';
import { StorageError, toStorageFailure } from '../data/repository/storageFailure.js';
import type { StorageFailure } from '../data/repository/storageFailure.js';
import type { CharacterRepository } from '../data/repository/types.js';
import type { CharacterSheetBO } from './characterSheet.js';

/**
 * Spec §6's pipeline: observe the document, debounce, stamp `updatedAt` on a copy, save.
 *
 * The spec names `mobx-utils`' `deepObserve` as the observation half. This uses `reaction` over
 * `sheet.toDocument()` instead, and does not install `mobx-utils`. `toDocument()` is `toJS` of
 * the observable document, so reading it inside a reaction's expression tracks every field,
 * every array and every record key in the tree — the same reach `deepObserve` has, for the
 * purpose autosave actually needs, which is "something, somewhere, changed" rather than a
 * per-node change event this class would only discard.
 *
 * Measured against the installed mobx@7.0.3 rather than recalled, because the cost of a full
 * `toJS` per keystroke would have been the reason to prefer `deepObserve`: on a deliberately
 * oversized character (124 KB of JSON — far past anything a real sheet reaches) `toDocument()`
 * takes 0.59 ms, and twenty edits in one window ran the expression twice, not twenty times.
 *
 * The debounce is this class's own `setTimeout` and not `reaction`'s `delay` option, which was
 * the first attempt. `delay` schedules the effect internally and hands the caller no way to ask
 * for it early — so `flush()` on `pagehide` had nothing to flush, and the last edit before the
 * tab went away was exactly the one that would be lost.
 */
export interface AutosaveOptions {
  /** Spec §6: 500ms. Injectable so a test asserts coalescing without waiting it out. */
  debounceMs?: number;
  /** Injectable so the `updatedAt` stamp is assertable without a wall clock. */
  now?: () => Date;
  /**
   * Where a refused or failed write goes. Spec §6 requires `SAVE_REFUSED` be surfaced
   * prominently rather than retried; `CharacterLibraryBO` points this at `StorageGate`.
   */
  onFailure?: (failure: StorageFailure) => void;
  /**
   * The event target carrying `pagehide` and `visibilitychange`. Defaults to `globalThis` when
   * it is an event target at all, and to nothing under plain Node, where neither event exists.
   */
  target?: Pick<EventTarget, 'addEventListener' | 'removeEventListener'> | null;
}

type Target = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

function defaultTarget(): Target | null {
  return typeof globalThis.addEventListener === 'function' ? globalThis : null;
}

export class Autosave {
  readonly #sheet: CharacterSheetBO;
  readonly #repository: CharacterRepository;
  readonly #debounceMs: number;
  readonly #now: () => Date;
  readonly #onFailure: (failure: StorageFailure) => void;
  readonly #target: Target | null;

  #stopReaction: (() => void) | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  /**
   * Whether an edit has arrived that no `save()` has covered yet. A flag rather than the
   * document itself: the write always sends the sheet's current state, so a flush that lands
   * after two more keystrokes saves those too instead of an older snapshot the reaction happened
   * to capture.
   */
  #dirty = false;

  constructor(
    sheet: CharacterSheetBO,
    repository: CharacterRepository,
    options: AutosaveOptions = {},
  ) {
    this.#sheet = sheet;
    this.#repository = repository;
    this.#debounceMs = options.debounceMs ?? 500;
    this.#now = options.now ?? (() => new Date());
    this.#onFailure = options.onFailure ?? (() => {});
    this.#target = options.target === undefined ? defaultTarget() : options.target;
  }

  start(): void {
    if (this.#stopReaction !== null) return;
    this.#stopReaction = reaction(
      () => this.#sheet.toDocument(),
      () => this.#schedule(),
    );
    this.#target?.addEventListener('pagehide', this.#onHide);
    this.#target?.addEventListener('visibilitychange', this.#onHide);
  }

  /**
   * Detaches, then writes anything the window had not reached yet. The write is deliberately not
   * awaited: `CharacterSheetBO.dispose()` is synchronous by spec §4, so a caller that closes a
   * sheet cannot await this — and losing the last half second of typing because the debounce was
   * mid-flight would be the worst kind of quiet data loss. A caller that needs the write to have
   * landed awaits `flush()` first.
   */
  stop(): void {
    this.#stopReaction?.();
    this.#stopReaction = null;
    this.#target?.removeEventListener('pagehide', this.#onHide);
    this.#target?.removeEventListener('visibilitychange', this.#onHide);
    void this.flush();
  }

  /** Writes now if there is anything to write. Resolves once the repository has. */
  async flush(): Promise<void> {
    this.#clearTimer();
    if (!this.#dirty) return;
    this.#dirty = false;

    // Stamped on the copy, never on the observable document: writing it back would retrigger
    // the reaction that led here and the save loop would never settle (spec §6).
    const doc = { ...this.#sheet.toDocument(), updatedAt: this.#now().toISOString() };
    try {
      await this.#repository.save(doc);
    } catch (caught) {
      // Reported once and not retried. A refused document is invalid for a reason that will not
      // change by trying again, and a retry loop would bury the report under its own traffic.
      this.#onFailure(caught instanceof StorageError ? caught.detail : toStorageFailure(caught));
    }
  }

  #schedule(): void {
    this.#dirty = true;
    this.#clearTimer();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.flush();
    }, this.#debounceMs);
  }

  #clearTimer(): void {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#timer = null;
  }

  /**
   * `pagehide` and `visibilitychange` both, because neither alone is enough: iOS Safari may
   * never fire `pagehide` when the app is swiped away, and `visibilitychange` does not fire on
   * a desktop tab close. The flush is a no-op when nothing is dirty, so the overlap costs
   * nothing. `visibilitychange` is not filtered on `document.hidden` — this class has no
   * document to ask, and becoming *visible* with nothing dirty writes nothing anyway.
   */
  readonly #onHide = (): void => {
    void this.flush();
  };
}
