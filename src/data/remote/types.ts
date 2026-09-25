import type { LoadError } from '../migration/errors.js';
import type { NewVersion } from './cloudDocument.js';
import type { Payload } from './codec.js';
import type { CloudDocument } from './layout/index.js';

export type { Payload };

/** The cloud document, read. `doc: null`: this player has never uploaded. */
export type CloudLoad = { ok: true; doc: CloudDocument | null } | { ok: false; error: LoadError };

export interface CloudUser {
  uid: string;
  name: string | null;
  email: string | null;
  /** Google's profile picture, an https URL on Google's servers; never copied into the app. */
  photoUrl: string | null;
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
  // The three below take the uid they act for: the one the caller listed, never whoever Auth says
  // is signed in now, which another tab can change. The rules refuse any other uid.
  /** `uid`'s whole cloud document (spec §4). */
  load(uid: string): Promise<CloudLoad>;
  /** One merge write, no read. Over the limit, Firestore refuses it. */
  upload(uid: string, characterId: string, uploadedAt: string, version: NewVersion): Promise<void>;
  /** One transaction. `null` deletes every version. Unreadable documents are returned, not written. */
  deleteVersions(
    uid: string,
    characterId: string,
    uploadedAts: readonly string[] | null,
  ): Promise<CloudLoad>;
}
