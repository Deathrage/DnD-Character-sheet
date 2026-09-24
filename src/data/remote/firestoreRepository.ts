import { initializeApp } from 'firebase/app';
import {
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import {
  Bytes,
  collection,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  getFirestore,
  writeBatch,
} from 'firebase/firestore/lite';
import { z } from 'zod';
import { CloudError, toCloudError } from './cloudError.js';
import { firebaseConfig } from './config.js';
import type { CloudCharacter, CloudRepository, CloudUser, CloudVersion, Payload } from './types.js';

/**
 * Not strict, unlike every schema in `src/data/schema/`: this is the app's own index, not a
 * character, and a newer build that adds a field must not make an older one's cloud screen fail.
 * Still validated, so a malformed entry fails the list loudly instead of rendering `undefined`.
 */
const entrySchema = z.object({
  name: z.string(),
  classes: z.array(z.object({ name: z.string(), level: z.number() })),
  totalLevel: z.number(),
  sheetUpdatedAt: z.string(),
  schemaVersion: z.number(),
  bytes: z.number(),
});
const indexSchema = z.object({ versions: z.record(z.string(), entrySchema) });

/** Batches cap at 500 writes. */
const BATCH = 500;

/**
 * Lite Firestore: plain get/set, no realtime listeners, no offline cache — the cloud is only
 * touched on a button press. Every call goes through `guard`, so what escapes is a `CloudError`.
 */
export function createFirestoreRepository(): CloudRepository {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  // A redirect sign-in completes here, on the load after it. Its failure is remembered and
  // reported once, by `currentUser` below, rather than dropped: a player who never sees it comes
  // back signed out with no error anywhere, for reasons as ordinary as `auth/unauthorized-domain`.
  let redirectFailure: CloudError | null = null;
  const ready = getRedirectResult(auth)
    .catch((caught: unknown) => {
      redirectFailure = toCloudError(caught);
    })
    .then(() => auth.authStateReady());

  const toUser = (user: User): CloudUser => ({
    uid: user.uid,
    name: user.displayName,
    email: user.email,
  });
  const uid = (): string => {
    const user = auth.currentUser;
    if (user === null) throw new CloudError('SIGNED_OUT');
    return user.uid;
  };
  const indexRef = (characterId: string) => doc(db, 'users', uid(), 'characters', characterId);
  const payloadRef = (characterId: string, uploadedAt: string) =>
    doc(db, 'users', uid(), 'characters', characterId, 'payloads', uploadedAt);

  async function guard<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (caught) {
      throw toCloudError(caught);
    }
  }

  return {
    currentUser: () =>
      guard(async () => {
        await ready;
        if (redirectFailure !== null) {
          const failure = redirectFailure;
          redirectFailure = null;
          throw failure;
        }
        return auth.currentUser === null ? null : toUser(auth.currentUser);
      }),

    signIn: () =>
      guard(async () => {
        const provider = new GoogleAuthProvider();
        // Popup in dev: localhost is not `authDomain`'s origin, and a cross-origin redirect loses
        // its result to storage partitioning. In production the redirect is same-origin.
        if (import.meta.env.DEV) return toUser((await signInWithPopup(auth, provider)).user);
        return signInWithRedirect(auth, provider);
      }),

    signOut: () => guard(() => signOut(auth)),

    listCharacters: () =>
      guard(async () => {
        const snapshot = await getDocs(collection(db, 'users', uid(), 'characters'));
        const characters: CloudCharacter[] = snapshot.docs.map((row) => ({
          characterId: row.id,
          versions: Object.entries(indexSchema.parse(row.data()).versions)
            .map(([uploadedAt, entry]): CloudVersion => ({ uploadedAt, ...entry }))
            // ISO 8601 with milliseconds sorts lexically in time order.
            .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt)),
        }));
        // An emptied index: another device deleted a version at the same moment. Nothing to show.
        return characters.filter((character) => character.versions.length > 0);
      }),

    upload: (characterId, { uploadedAt, ...entry }, payload) =>
      guard(() =>
        writeBatch(db)
          .set(payloadRef(characterId, uploadedAt), {
            sheet: Bytes.fromUint8Array(payload.sheet),
            portrait: payload.portrait === null ? null : Bytes.fromUint8Array(payload.portrait),
          })
          // `merge`: adds this one key and leaves the others, so two devices uploading at once
          // both keep their version. Map keys in `set` data are literal, dots included.
          .set(indexRef(characterId), { versions: { [uploadedAt]: entry } }, { merge: true })
          .commit(),
      ),

    getPayload: (characterId, uploadedAt) =>
      guard(async () => {
        const snapshot = await getDoc(payloadRef(characterId, uploadedAt));
        if (!snapshot.exists()) return null;
        const { sheet, portrait } = snapshot.data();
        if (!(sheet instanceof Bytes))
          throw new CloudError('UNKNOWN', 'payload has no sheet bytes');
        return {
          sheet: new Uint8Array(sheet.toUint8Array()),
          portrait: portrait instanceof Bytes ? new Uint8Array(portrait.toUint8Array()) : null,
        } satisfies Payload;
      }),

    deleteVersion: (characterId, uploadedAt) =>
      guard(() =>
        writeBatch(db)
          .delete(payloadRef(characterId, uploadedAt))
          // A `FieldPath`, not the string `versions.${uploadedAt}`: the key contains dots, which a
          // string path would read as nesting.
          .update(indexRef(characterId), new FieldPath('versions', uploadedAt), deleteField())
          .commit(),
      ),

    deleteCharacter: (characterId, uploadedAts) =>
      guard(async () => {
        for (let start = 0; start < uploadedAts.length; start += BATCH) {
          const batch = writeBatch(db);
          for (const uploadedAt of uploadedAts.slice(start, start + BATCH)) {
            batch.delete(payloadRef(characterId, uploadedAt));
          }
          await batch.commit();
        }
        // Last, so a failure above leaves the index naming what is still there, and a retry —
        // deleting an absent payload succeeds — finishes the job.
        await writeBatch(db).delete(indexRef(characterId)).commit();
      }),
  };
}
