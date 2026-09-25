// src/business/cloudBackup.ts
import { observable } from 'mobx';
import { describeLoadError } from '../data/migration/errors.js';
import { cloudDocumentSize, withVersion, type NewVersion } from '../data/remote/cloudDocument.js';
import {
  CloudError,
  describeCloudError,
  describeFull,
  describeLayoutError,
  toCloudError,
} from '../data/remote/cloudError.js';
import { decodePayload, encodePayload, portraitHash } from '../data/remote/codec.js';
import type { CloudDocument, CloudVersionData } from '../data/remote/layout/index.js';
import { MAX_DOCUMENT_BYTES, stringSize, valueSize } from '../data/remote/size.js';
import type { CloudRepository, CloudUser } from '../data/remote/types.js';
import { StorageError } from '../data/repository/storageFailure.js';
import { summarize } from '../data/repository/summarize.js';
import type { CharacterDocument } from '../data/schema/index.js';
import type { CharacterLibraryBO, RestoreChoice, RestoreResult } from './characterLibrary.js';
import { describeStorageFailure } from './errors.js';
import './mobxConfig.js';

export type { CloudUser };

export interface CloudVersion {
  uploadedAt: string;
  /** This version's own entry. A portrait it shares with others is counted in `usedBytes` only. */
  bytes: number;
  /** What its sheet says, or `null` when it cannot be read and `problem` says why. */
  sheet: {
    name: string;
    classes: { name: string; level: number }[];
    totalLevel: number;
    sheetUpdatedAt: string;
  } | null;
  problem: string | null;
  fromNewerApp: boolean;
}

/** `versions` is newest first. */
export interface CloudCharacter {
  characterId: string;
  versions: CloudVersion[];
}

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

/** Marks a failure whose message is already the sentence to show. */
const REFUSED = Symbol('refused');
const refused = (message: string) => new Error(message, { cause: REFUSED });

type Decoded =
  | { ok: true; doc: CharacterDocument; portrait: string | null }
  | { ok: false; problem: string; fromNewerApp: boolean };

async function decodeVersion(
  doc: CloudDocument,
  characterId: string,
  version: CloudVersionData,
): Promise<Decoded> {
  const portrait = version.portrait === null ? null : doc.portraits?.[version.portrait];
  if (portrait === undefined) {
    return { ok: false, problem: 'Its portrait is missing from the cloud.', fromNewerApp: false };
  }
  const result = await decodePayload({ sheet: version.sheet, portrait }, characterId);
  if (result.ok) return result;
  return result.kind === 'corrupt'
    ? {
        ok: false,
        problem: `This cloud version is damaged. ${result.message}`,
        fromNewerApp: false,
      }
    : {
        ok: false,
        problem: describeLoadError(result.error),
        fromNewerApp: result.error.code === 'FROM_FUTURE',
      };
}

/** The local list's own summary (`summarize`), plus the time the conflict dialog compares. */
function summaryOf(doc: CharacterDocument): NonNullable<CloudVersion['sheet']> {
  const { name, classes, totalLevel } = summarize(doc, null);
  return { name, classes, totalLevel, sheetUpdatedAt: doc.updatedAt };
}

/**
 * Optional cloud backup: dated versions of a character in one Firestore document, behind Google
 * sign-in.
 *
 * A bare noun like `StorageGate`, for the same reason: it wraps no `*Data`. Its state is the
 * signed-in user and a decoded copy of the cloud document, neither of which is a slice of a
 * character.
 *
 * Nothing here throws to its caller. Every action answers with a sentence or `null`, because a
 * rejected promise from a button press is a failure nobody sees.
 */
export class CloudBackup {
  /** Firestore's own document limit: the quota (cloud-quota spec §1). */
  readonly limitBytes = MAX_DOCUMENT_BYTES;

  readonly #library: CharacterLibraryBO;
  readonly #load: () => Promise<CloudRepository>;
  readonly #now: () => Date;
  #repository: Promise<CloudRepository> | null = null;
  /**
   * The sentence for the last `currentUser()` rejection — a redirect sign-in that just failed —
   * or `null`. Reset by every `#signedInUser()`, so only the caller right after it sees it.
   */
  #signInFailure: string | null = null;
  /** The last document read, and whether one has been read since sign-in: an upload is only listed on top of a real listing. */
  #doc: CloudDocument | null = null;
  #listed = false;
  /** Every listed version, decoded. Keyed `${characterId}/${uploadedAt}`; a version never changes, so a key never goes stale. */
  #decoded = new Map<string, Decoded>();
  readonly #state = observable(
    {
      status: 'unknown' as CloudStatus,
      user: null as CloudUser | null,
      characters: [] as CloudCharacter[],
      usedBytes: 0,
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
  /** The cloud document's size by Firestore's rules, out of `limitBytes`. */
  get usedBytes(): number {
    return this.#state.usedBytes;
  }
  get busy(): boolean {
    return this.#state.busy;
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

  /** Signed in: re-reads the cloud document. Signed out: only settles `status`. */
  async refresh(): Promise<string | null> {
    const user = await this.#signedInUser();
    if (user === null) {
      if (this.#signInFailure !== null) return this.#takeSignInFailure();
      return this.#state.status === 'unavailable' ? UNAVAILABLE : null;
    }
    return this.#run(async (repository, uid) => {
      const loaded = await repository.load();
      if (!loaded.ok) throw refused(describeLayoutError(loaded.error));
      await this.#apply(loaded.doc, uid);
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
    // Forgotten at once: the next person at this device must not see, or restore, this account's
    // characters.
    this.#doc = null;
    this.#listed = false;
    this.#decoded = new Map();
    this.#state.user = null;
    this.#state.characters = [];
    this.#state.usedBytes = 0;
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
      const version: NewVersion = {
        sheet: payload.sheet,
        portrait:
          payload.portrait === null
            ? null
            : { hash: await portraitHash(payload.portrait), bytes: payload.portrait },
      };
      const uploadedAt = this.#now().toISOString();
      try {
        await repository.upload(characterId, uploadedAt, version);
      } catch (caught) {
        return {
          ok: false,
          message: await this.#uploadFailure(
            caught,
            repository,
            user.uid,
            characterId,
            uploadedAt,
            version,
          ),
        };
      }
      if (this.#listed) {
        this.#decoded.set(`${characterId}/${uploadedAt}`, { ok: true, doc: stored.doc, portrait });
        await this.#apply(withVersion(this.#doc, characterId, uploadedAt, version), user.uid);
      }
      return { ok: true, uploadedAt };
    } catch (caught) {
      return { ok: false, message: this.#describe(caught) };
    }
  }

  /** Spec §5: the numbers decide "full", never the error code, which production may word differently. */
  async #uploadFailure(
    caught: unknown,
    repository: CloudRepository,
    uid: string,
    characterId: string,
    uploadedAt: string,
    version: NewVersion,
  ): Promise<string> {
    if (toCloudError(caught).code === 'UNKNOWN') {
      try {
        const loaded = await repository.load();
        if (loaded.ok) {
          const before = loaded.doc === null ? 0 : cloudDocumentSize(uid, loaded.doc);
          const after = cloudDocumentSize(
            uid,
            withVersion(loaded.doc, characterId, uploadedAt, version),
          );
          if (after > MAX_DOCUMENT_BYTES) {
            return describeFull(after - before, MAX_DOCUMENT_BYTES - before);
          }
        }
      } catch {
        // The upload's own failure is the one to report.
      }
    }
    return this.#describe(caught);
  }

  /**
   * Settled by `library.restore`, the same path an imported file takes: without `choice`, a
   * character already in this browser comes back as a conflict for the player to settle. Makes no
   * cloud call: the version is the one the listing already decoded, and a version never changes.
   */
  async restore(
    characterId: string,
    uploadedAt: string,
    choice?: RestoreChoice,
  ): Promise<RestoreResult> {
    const failed = (message: string): RestoreResult => ({ ok: false, kind: 'failed', message });
    const entry = this.#decoded.get(`${characterId}/${uploadedAt}`);
    if (entry === undefined) return failed(describeCloudError(new CloudError('NOT_FOUND')));
    // A copy decoded for an account that is no longer signed in is not this player's to restore.
    if (this.#state.user === null) return failed(describeCloudError(new CloudError('SIGNED_OUT')));
    if (!entry.ok) return failed(entry.problem);
    if (this.#state.busy) return failed(BUSY);
    this.#state.busy = true;
    try {
      // A copy: the library may give it a new id (Keep both), and this one stays listed.
      return await this.#library.restore(structuredClone(entry.doc), entry.portrait, choice);
    } catch (caught) {
      return failed(this.#describe(caught));
    } finally {
      this.#state.busy = false;
    }
  }

  deleteVersion(characterId: string, uploadedAt: string): Promise<string | null> {
    return this.#delete(characterId, [uploadedAt]);
  }

  /** Every version in the cloud, including one another device uploaded since this list was read. */
  deleteCharacter(characterId: string): Promise<string | null> {
    return this.#delete(characterId, null);
  }

  #delete(characterId: string, uploadedAts: readonly string[] | null): Promise<string | null> {
    return this.#run(async (repository, uid) => {
      const loaded = await repository.deleteVersions(characterId, uploadedAts);
      if (!loaded.ok) throw refused(describeLayoutError(loaded.error));
      await this.#apply(loaded.doc, uid);
    });
  }

  /** Rebuilds the list and the usage from a document, decoding only versions not seen before. */
  async #apply(doc: CloudDocument | null, uid: string): Promise<void> {
    const decoded = new Map<string, Decoded>();
    const characters: CloudCharacter[] = [];
    for (const [characterId, versions] of Object.entries(doc?.characters ?? {})) {
      const list: CloudVersion[] = [];
      for (const [uploadedAt, version] of Object.entries(versions)) {
        const key = `${characterId}/${uploadedAt}`;
        const entry = this.#decoded.get(key) ?? (await decodeVersion(doc!, characterId, version));
        decoded.set(key, entry);
        list.push({
          uploadedAt,
          bytes: stringSize(uploadedAt) + valueSize(version),
          sheet: entry.ok ? summaryOf(entry.doc) : null,
          problem: entry.ok ? null : entry.problem,
          fromNewerApp: !entry.ok && entry.fromNewerApp,
        });
      }
      // ISO 8601 with milliseconds sorts lexically in time order.
      list.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      characters.push({ characterId, versions: list });
    }
    // Signed out (or in as someone else) while this was loading or decoding: nothing of `uid`'s
    // cloud may be put back after `signOut` cleared it.
    if (this.#state.user?.uid !== uid) return;
    this.#doc = doc;
    this.#listed = true;
    this.#decoded = decoded;
    this.#state.characters = characters;
    this.#state.usedBytes = doc === null ? 0 : cloudDocumentSize(uid, doc);
  }

  /** Runs one cloud action under the busy flag, as a sentence or `null`. */
  async #run(
    action: (repository: CloudRepository, uid: string) => Promise<void>,
  ): Promise<string | null> {
    if (this.#state.busy) return BUSY;
    this.#state.busy = true;
    try {
      const repository = await this.#repo();
      if (repository === null) return UNAVAILABLE;
      const uid = this.#state.user?.uid;
      if (uid === undefined) throw new CloudError('SIGNED_OUT');
      await action(repository, uid);
      return null;
    } catch (caught) {
      return this.#describe(caught);
    } finally {
      this.#state.busy = false;
    }
  }

  #describe(caught: unknown): string {
    if (caught instanceof Error && caught.cause === REFUSED) return caught.message;
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
}
