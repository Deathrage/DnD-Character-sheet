import type { Payload } from './codec.js';

export type { Payload };

export interface CloudUser {
  uid: string;
  name: string | null;
  email: string | null;
}

/**
 * One upload, as its entry in the character's index document. `uploadedAt` is the entry's map key
 * and the payload's document id; everything else is copied from the sheet at upload time, so the
 * cloud screen draws a row without downloading the payload.
 */
export interface CloudVersion {
  uploadedAt: string;
  name: string;
  classes: { name: string; level: number }[];
  /** `summarize()`'s value: the list's own number, not a new calculation. */
  totalLevel: number;
  /** The sheet's own `updatedAt` — what the conflict dialog compares, not the upload time. */
  sheetUpdatedAt: string;
  schemaVersion: number;
  /** Payload size, for the usage display. */
  bytes: number;
}

/** `versions` is newest first, and never empty: an emptied index is not listed. */
export interface CloudCharacter {
  characterId: string;
  versions: CloudVersion[];
}

/**
 * The cloud as the business layer sees it. The Firestore implementation is
 * `firestoreRepository.ts`; tests use an in-memory fake. Every method rejects with a
 * `CloudError`, never with a Firebase type.
 */
export interface CloudRepository {
  /**
   * Rejects once with the failure of a redirect sign-in that just returned; otherwise resolves
   * once Firebase knows who is signed in.
   */
  currentUser(): Promise<CloudUser | null>;
  /** With a redirect this navigates away and never settles; with a popup it resolves. */
  signIn(): Promise<CloudUser>;
  signOut(): Promise<void>;
  listCharacters(): Promise<CloudCharacter[]>;
  /** One batch: the payload, and the version's key merged into the index. */
  upload(characterId: string, version: CloudVersion, payload: Payload): Promise<void>;
  /** `null` when that version is no longer in the cloud. */
  getPayload(characterId: string, uploadedAt: string): Promise<Payload | null>;
  /** One batch: the payload, and its key removed from the index. Not for the last version. */
  deleteVersion(characterId: string, uploadedAt: string): Promise<void>;
  /** Every payload named, then the index last — so a failure partway can be retried. */
  deleteCharacter(characterId: string, uploadedAts: readonly string[]): Promise<void>;
}
