// src/business/cloudBackup.ts
import { observable } from 'mobx';
import { describeLoadError } from '../data/migration/errors.js';
import { CloudError, describeCloudError, toCloudError } from '../data/remote/cloudError.js';
import { decodePayload, encodePayload } from '../data/remote/codec.js';
import type {
  CloudCharacter,
  CloudRepository,
  CloudUser,
  CloudVersion,
} from '../data/remote/types.js';
import { StorageError } from '../data/repository/storageFailure.js';
import { summarize } from '../data/repository/summarize.js';
import { CURRENT } from '../data/schema/index.js';
import type { CharacterLibraryBO, RestoreChoice, RestoreResult } from './characterLibrary.js';
import { describeStorageFailure } from './errors.js';
import './mobxConfig.js';

export type { CloudCharacter, CloudUser, CloudVersion };

/** `unknown` until the first check (`checkSignIn`, `refresh`, or any cloud action) loads Firebase. */
export type CloudStatus = 'unknown' | 'signedOut' | 'signingIn' | 'signedIn' | 'unavailable';
export type UploadResult = { ok: true; uploadedAt: string } | { ok: false; message: string };

export interface CloudBackupOptions {
  /** Defaults to a dynamic import, so Firebase is never executed before a cloud action. */
  load?: () => Promise<CloudRepository>;
  now?: () => Date;
}

const BUSY = 'Wait for the current cloud action to finish.';
const UNAVAILABLE = 'Cloud backup could not be loaded. Check your connection and try again.';

const loadFirestore = async (): Promise<CloudRepository> =>
  (await import('../data/remote/firestoreRepository.js')).createFirestoreRepository();

/** Marks a restore refused on content — its message is already the sentence to show. */
const RESTORE_REFUSED = Symbol('restore refused');

/**
 * Optional cloud backup: dated versions of a character in Firestore, behind Google sign-in.
 *
 * A bare noun like `StorageGate`, for the same reason: it wraps no `*Data`. Its state is the
 * signed-in user and a copy of the cloud's index, neither of which is a slice of a character.
 *
 * Nothing here throws to its caller. Every action answers with a sentence or `null`, because a
 * rejected promise from a button press is a failure nobody sees.
 */
export class CloudBackup {
  /** The schema this build understands, so the screen can flag a version from a newer app. */
  readonly schemaVersion = CURRENT;

  readonly #library: CharacterLibraryBO;
  readonly #load: () => Promise<CloudRepository>;
  readonly #now: () => Date;
  #repository: Promise<CloudRepository> | null = null;
  /**
   * The sentence for the last `currentUser()` rejection — a redirect sign-in that just failed —
   * or `null`. Reset by every `#signedInUser()`, so only the caller right after it sees it.
   */
  #signInFailure: string | null = null;
  readonly #state = observable(
    {
      status: 'unknown' as CloudStatus,
      user: null as CloudUser | null,
      characters: [] as CloudCharacter[],
      busy: false,
      lastUpload: null as { characterId: string; result: UploadResult } | null,
    },
    {},
    { deep: false },
  );

  constructor(library: CharacterLibraryBO, options: CloudBackupOptions = {}) {
    this.#library = library;
    this.#load = options.load ?? loadFirestore;
    this.#now = options.now ?? (() => new Date());
  }

  get status(): CloudStatus {
    return this.#state.status;
  }
  get user(): CloudUser | null {
    return this.#state.user;
  }
  /** Newest version first within each character. */
  get characters(): CloudCharacter[] {
    return this.#state.characters;
  }
  get busy(): boolean {
    return this.#state.busy;
  }
  get totalBytes(): number {
    return this.#state.characters
      .flatMap((character) => character.versions)
      .reduce((total, version) => total + version.bytes, 0);
  }
  /** The last upload's outcome, for the sheet that asked for it. */
  get lastUpload(): { characterId: string; result: UploadResult } | null {
    return this.#state.lastUpload;
  }

  /**
   * Settles `status` without listing anything, so a sheet can tell whether Upload is possible. It
   * loads Firebase — the first time only, and never at launch: a sheet calls it when it opens. A
   * status already known is left alone; an `unavailable` one is retried.
   */
  async checkSignIn(): Promise<void> {
    if (this.#state.status === 'unknown' || this.#state.status === 'unavailable') {
      await this.#signedInUser();
    }
  }

  /** Signed in: re-reads the index. Signed out: only settles `status`. */
  async refresh(): Promise<string | null> {
    const user = await this.#signedInUser();
    if (user === null) {
      if (this.#signInFailure !== null) return this.#takeSignInFailure();
      return this.#state.status === 'unavailable' ? UNAVAILABLE : null;
    }
    return this.#run(async (repository) => {
      this.#state.characters = await repository.listCharacters();
    });
  }

  async signIn(): Promise<string | null> {
    const repository = await this.#repo();
    if (repository === null) return UNAVAILABLE;
    this.#state.status = 'signingIn';
    try {
      // With a redirect the page navigates away inside this await, and nothing below runs.
      this.#state.user = await repository.signIn();
      this.#state.status = 'signedIn';
    } catch (caught) {
      this.#state.status = 'signedOut';
      return describeCloudError(toCloudError(caught));
    }
    return this.refresh();
  }

  async signOut(): Promise<string | null> {
    const repository = await this.#repo();
    if (repository === null) return UNAVAILABLE;
    try {
      await repository.signOut();
    } catch (caught) {
      return describeCloudError(toCloudError(caught));
    }
    // Forgotten at once: the next person at this device must not see this account's characters.
    this.#state.user = null;
    this.#state.characters = [];
    this.#state.status = 'signedOut';
    return null;
  }

  /**
   * Uploads what is stored for this character as a new version, flushing autosave first so the
   * last half second of typing is in it. Signed out, it refuses with a sentence: signing in is the
   * character list's menu, and the sheet's button is disabled until then.
   */
  async upload(characterId: string): Promise<UploadResult> {
    if (this.#state.busy) return { ok: false, message: BUSY };
    this.#state.busy = true; // taken before any await, so a second press sees it
    let result: UploadResult;
    try {
      result = await this.#upload(characterId);
    } finally {
      this.#state.busy = false;
    }
    this.#state.lastUpload = { characterId, result };
    return result;
  }

  async #upload(characterId: string): Promise<UploadResult> {
    const user = await this.#signedInUser();
    if (user === null) {
      const message =
        this.#signInFailure ??
        (this.#state.status === 'unavailable'
          ? UNAVAILABLE
          : describeCloudError(new CloudError('SIGNED_OUT')));
      return { ok: false, message };
    }
    const repository = await this.#repo();
    if (repository === null || user === null) return { ok: false, message: UNAVAILABLE };

    try {
      await this.#library.flush();
      const stored = await this.#library.repository.get(characterId);
      if (stored === null)
        return { ok: false, message: 'This character is no longer in this app.' };
      if (!stored.ok) {
        return {
          ok: false,
          message: `Repair this character before uploading it. ${describeLoadError(stored.error)}`,
        };
      }
      const portrait = await this.#library.repository.getPortrait(characterId);
      const payload = await encodePayload(stored.doc, portrait);
      const { name, classes, totalLevel } = summarize(stored.doc, null);
      const version: CloudVersion = {
        uploadedAt: this.#now().toISOString(),
        name,
        classes,
        totalLevel,
        sheetUpdatedAt: stored.doc.updatedAt,
        schemaVersion: stored.doc.schemaVersion,
        bytes: payload.sheet.byteLength + (payload.portrait?.byteLength ?? 0),
      };
      await repository.upload(characterId, version, payload);
      this.#addVersion(characterId, version);
      return { ok: true, uploadedAt: version.uploadedAt };
    } catch (caught) {
      return { ok: false, message: this.#describe(caught) };
    }
  }

  /**
   * Settled by `library.restore`, the same path an imported file takes: without `choice`, a
   * character already in this browser comes back as a conflict for the player to settle.
   */
  async restore(
    characterId: string,
    uploadedAt: string,
    choice?: RestoreChoice,
  ): Promise<RestoreResult> {
    const failed = (message: string): RestoreResult => ({ ok: false, kind: 'failed', message });
    const version = this.#state.characters
      .find((character) => character.characterId === characterId)
      ?.versions.find((candidate) => candidate.uploadedAt === uploadedAt);
    if (version === undefined) return failed(describeCloudError(new CloudError('NOT_FOUND')));

    // Typed through `as`, not an annotation: an annotated `= null` narrows `result` to `null`,
    // and TypeScript does not see the assignment inside the callback.
    let result = null as RestoreResult | null;
    const message = await this.#run(async (repository) => {
      const payload = await repository.getPayload(characterId, uploadedAt);
      if (payload === null) throw new CloudError('NOT_FOUND');
      const decoded = await decodePayload(payload, characterId);
      if (!decoded.ok) {
        throw new Error(
          decoded.kind === 'document'
            ? describeLoadError(decoded.error)
            : `This cloud version is damaged. ${decoded.message}`,
          { cause: RESTORE_REFUSED },
        );
      }
      result = await this.#library.restore(decoded.doc, decoded.portrait, choice);
    });
    return message === null && result !== null ? result : failed(message ?? UNAVAILABLE);
  }

  deleteVersion(characterId: string, uploadedAt: string): Promise<string | null> {
    return this.#run(async (repository) => {
      const character = this.#state.characters.find((c) => c.characterId === characterId);
      if (character === undefined) return;
      // Never the whole index, even for what this list thinks is the last version: another device
      // may have uploaded one since. An emptied index is hidden by `listCharacters` (spec §12).
      await repository.deleteVersion(characterId, uploadedAt);
      this.#state.characters = this.#state.characters
        .map((c) =>
          c.characterId === characterId
            ? { ...c, versions: c.versions.filter((v) => v.uploadedAt !== uploadedAt) }
            : c,
        )
        .filter((c) => c.versions.length > 0);
    });
  }

  deleteCharacter(characterId: string): Promise<string | null> {
    return this.#run(async (repository) => {
      const character = this.#state.characters.find((c) => c.characterId === characterId);
      if (character === undefined) return;
      await repository.deleteCharacter(
        characterId,
        character.versions.map((version) => version.uploadedAt),
      );
      this.#state.characters = this.#state.characters.filter((c) => c.characterId !== characterId);
    });
  }

  /** Runs one cloud action under the busy flag, as a sentence or `null`. */
  async #run(action: (repository: CloudRepository) => Promise<void>): Promise<string | null> {
    if (this.#state.busy) return BUSY;
    this.#state.busy = true;
    try {
      const repository = await this.#repo();
      if (repository === null) return UNAVAILABLE;
      await action(repository);
      return null;
    } catch (caught) {
      return this.#describe(caught);
    } finally {
      this.#state.busy = false;
    }
  }

  #describe(caught: unknown): string {
    if (caught instanceof Error && caught.cause === RESTORE_REFUSED) return caught.message;
    if (caught instanceof StorageError) return describeStorageFailure(caught.detail);
    return describeCloudError(toCloudError(caught));
  }

  /** Loads Firebase once. A failed load is forgotten, so the next press tries again. */
  async #repo(): Promise<CloudRepository | null> {
    this.#repository ??= this.#load();
    try {
      return await this.#repository;
    } catch {
      this.#repository = null;
      this.#state.status = 'unavailable';
      return null;
    }
  }

  async #signedInUser(): Promise<CloudUser | null> {
    this.#signInFailure = null;
    const repository = await this.#repo();
    if (repository === null) return null;
    try {
      const user = await repository.currentUser();
      this.#state.user = user;
      this.#state.status = user === null ? 'signedOut' : 'signedIn';
      return user;
    } catch (caught) {
      // A failed redirect sign-in (cancelled, refused) leaves the player signed out, not the cloud
      // unavailable; only a connection failure or an unexplained one is `unavailable`.
      const error = toCloudError(caught);
      this.#state.user = null;
      this.#state.status =
        error.code === 'OFFLINE' || error.code === 'UNKNOWN' ? 'unavailable' : 'signedOut';
      this.#signInFailure = describeCloudError(error);
      return null;
    }
  }

  #takeSignInFailure(): string {
    const message = this.#signInFailure ?? UNAVAILABLE;
    this.#signInFailure = null;
    return message;
  }

  /** Inserted locally rather than re-listed: a re-list costs a read per character. */
  #addVersion(characterId: string, version: CloudVersion): void {
    const others = this.#state.characters.filter((c) => c.characterId !== characterId);
    const existing = this.#state.characters.find((c) => c.characterId === characterId);
    this.#state.characters = [
      { characterId, versions: [version, ...(existing?.versions ?? [])] },
      ...others,
    ];
  }
}
