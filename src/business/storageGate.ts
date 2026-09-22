import { observable } from 'mobx';
import type { StorageFailure } from '../data/repository/storageFailure.js';
import './mobxConfig.js';

/**
 * Spec §5's four states, and no fifth. A grant is permanent for the origin, so there is no route
 * back out of `granted`; `dismissedForSession` is deliberately not persisted, which is what makes
 * the gate return on the next launch (acceptance criterion 14).
 */
export type PersistenceState = 'unknown' | 'granted' | 'denied' | 'dismissedForSession';

export interface StorageUsage {
  usage: number;
  quota: number;
}

/**
 * The slice of `navigator.storage` this needs, declared rather than imported, so a test can hand
 * over a stub and so the absence of the API is a value (`null`) instead of a thrown TypeError.
 * `estimate` is optional because Safari has shipped `persisted`/`persist` without it.
 */
export interface PersistencePort {
  persisted(): Promise<boolean>;
  persist(): Promise<boolean>;
  estimate?(): Promise<{ usage?: number; quota?: number }>;
}

export interface StorageGateOptions {
  /** `null` stands for "no Storage API here" — private mode, an old browser, or a test. */
  port?: PersistencePort | null;
}

function defaultPort(): PersistencePort | null {
  const storage: unknown = globalThis.navigator?.storage;
  if (
    typeof storage === 'object' &&
    storage !== null &&
    'persisted' in storage &&
    typeof storage.persisted === 'function' &&
    'persist' in storage &&
    typeof storage.persist === 'function'
  ) {
    return storage as PersistencePort;
  }
  return null;
}

/**
 * App-global, not per character: whether this origin's storage can be evicted is a fact about the
 * browser, and the gate it drives covers the character list rather than any one sheet.
 *
 * **No `BO` suffix, and spec §5's `StorageBO` is wrong.** The suffix marks a class that
 * encapsulates a `*Data` — which is why `NodeBO<TData>`'s constructor cannot be called without a
 * node, and why `ClassesBO` takes a `ClassData[]`. This class encapsulates nothing of the kind:
 * its state is a browser permission and a transient failure, neither stored, neither loaded, and
 * neither expressible as a slice of `CharacterDocument`. It is a bare noun for the same reason
 * `Autosave` and `CharacterFile` are — they are the other two classes in this directory that
 * wrap no `*Data`. `Storage` unqualified was rejected: it collides with the DOM's `Storage`, the
 * same collision that kept `*Data` from being `*Node`.
 *
 * It carries no MobX annotation, per spec §3.5 — the observability is one `observable` state
 * object it reads through, the same shape `CharacterSheetBO` uses for the document. There is no
 * document here to be the single source, so this class brings its own.
 */
export class StorageGate {
  readonly #port: PersistencePort | null;
  readonly #state = observable({
    persistence: 'unknown' as PersistenceState,
    usage: null as StorageUsage | null,
    failure: null as StorageFailure | null,
  });

  constructor(options: StorageGateOptions = {}) {
    this.#port = options.port === undefined ? defaultPort() : options.port;
  }

  get persistence(): PersistenceState {
    return this.#state.persistence;
  }

  /** `navigator.storage.estimate()`, which the spec pads — the gate presents it as approximate. */
  get usage(): StorageUsage | null {
    return this.#state.usage;
  }

  get failure(): StorageFailure | null {
    return this.#state.failure;
  }

  /**
   * Reads the current grant without asking for one. Separate from `requestPersist` because the
   * request shows a browser prompt in some engines and must happen on a tap, never on launch.
   *
   * A `false` leaves the state `unknown` rather than moving it to `denied`: nothing has been
   * refused yet, and the gate's two phases turn on exactly that distinction — `ask` before a
   * request has been made, `refused` after one came back false.
   */
  async load(): Promise<void> {
    if (this.#port === null) return;
    const granted = await this.#port.persisted();
    if (granted) this.#state.persistence = 'granted';
    await this.#refreshUsage();
  }

  async requestPersist(): Promise<void> {
    if (this.#port === null) {
      this.#state.persistence = 'denied';
      return;
    }
    const granted = await this.#port.persist();
    this.#state.persistence = granted ? 'granted' : 'denied';
    await this.#refreshUsage();
  }

  /**
   * The escape hatch from a gate that would otherwise be a trap: first-run denial is the likely
   * outcome in Chrome, and an app that cannot be used at all is worse than one running on
   * best-effort storage. Session-only, so the gate returns on the next launch.
   */
  dismissForSession(): void {
    if (this.#state.persistence !== 'granted') {
      this.#state.persistence = 'dismissedForSession';
    }
  }

  /** Where the repository's and autosave's failures land, for a banner to read. */
  report(failure: StorageFailure): void {
    this.#state.failure = failure;
  }

  clearFailure(): void {
    this.#state.failure = null;
  }

  async #refreshUsage(): Promise<void> {
    const estimate = this.#port?.estimate;
    if (estimate === undefined) return;
    const { usage, quota } = await estimate.call(this.#port);
    this.#state.usage = usage === undefined || quota === undefined ? null : { usage, quota };
  }
}
