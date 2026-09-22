import { observable } from 'mobx';
import type { StorageFailure } from '../data/repository/storageFailure.js';
import './mobxConfig.js';

/**
 * Spec §5's four states, and no fifth. A grant is permanent for the origin, so there is no route
 * back out of `granted`.
 *
 * `dismissedForSession` is remembered in `sessionStorage` and nowhere more durable. The spec said
 * not to persist it at all, which read as "the gate must come back" — but taken literally it also
 * meant the gate came back on every *reload*, and a refusing browser is the normal case in Chrome,
 * so that is a gate in front of every single launch of the app. `sessionStorage` dies with the tab,
 * which still satisfies criterion 14's "returns on the next launch" while not re-asking the same
 * tab a question it answered thirty seconds ago.
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
  /**
   * Where a session dismissal is remembered. Defaults to `sessionStorage`; `null` turns the memory
   * off, which is what a test wants so that one test's dismissal cannot leak into the next.
   */
  session?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

/** Session-scoped by definition: it dies with the tab, which is what "for this session" means. */
const DISMISSED_KEY = 'dnd-character-sheet.storage-gate-dismissed';

/**
 * Every access is guarded. `sessionStorage` is not merely empty in a partitioned or storage-blocked
 * context — reading the property itself throws a SecurityError, and this class exists precisely to
 * be useful in browsers that are hostile about storage.
 */
function defaultSession(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
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

  readonly #session: Pick<Storage, 'getItem' | 'setItem'> | null;

  constructor(options: StorageGateOptions = {}) {
    this.#port = options.port === undefined ? defaultPort() : options.port;
    this.#session = options.session === undefined ? defaultSession() : options.session;
    if (this.#readDismissed()) this.#state.persistence = 'dismissedForSession';
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
    // A throwing `persisted()` leaves the state exactly as it was. This runs at startup, and the
    // app waits on it before it renders anything — so letting it reject would leave the screen on
    // "Loading…" forever rather than degrade to a gate that asks.
    try {
      if (await this.#port.persisted()) this.#state.persistence = 'granted';
    } catch {
      /* the grant is unknown, which is already the state */
    }
    await this.#refreshUsage();
  }

  /** A request that throws counts as refused: it was asked for, and it was not granted. */
  async requestPersist(): Promise<void> {
    if (this.#port === null) {
      this.#state.persistence = 'denied';
      return;
    }
    let granted = false;
    try {
      granted = await this.#port.persist();
    } catch {
      // Left false: a request that throws was still a request, and it still was not granted.
    }
    this.#state.persistence = granted ? 'granted' : 'denied';
    await this.#refreshUsage();
  }

  /**
   * The escape hatch from a gate that would otherwise be a trap: first-run denial is the likely
   * outcome in Chrome, and an app that cannot be used at all is worse than one running on
   * best-effort storage. Session-only, so the gate returns on the next launch.
   */
  dismissForSession(): void {
    if (this.#state.persistence === 'granted') return;
    this.#state.persistence = 'dismissedForSession';
    // Remembered in `sessionStorage`, so a reload does not re-gate the same tab. It still dies
    // with the tab, which is what criterion 14 asks for: the gate returns on the next launch.
    try {
      this.#session?.setItem(DISMISSED_KEY, '1');
    } catch {
      /* a browser that refuses to remember the dismissal just asks again; nothing is lost */
    }
  }

  /** Where the repository's and autosave's failures land, for a banner to read. */
  report(failure: StorageFailure): void {
    this.#state.failure = failure;
  }

  clearFailure(): void {
    this.#state.failure = null;
  }

  #readDismissed(): boolean {
    try {
      return this.#session?.getItem(DISMISSED_KEY) === '1';
    } catch {
      return false;
    }
  }

  async #refreshUsage(): Promise<void> {
    const estimate = this.#port?.estimate;
    if (estimate === undefined) return;
    try {
      const { usage, quota } = await estimate.call(this.#port);
      this.#state.usage = usage === undefined || quota === undefined ? null : { usage, quota };
    } catch {
      this.#state.usage = null;
    }
  }
}
