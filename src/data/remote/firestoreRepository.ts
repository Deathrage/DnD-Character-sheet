import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore/lite';
import { CloudError, toCloudError } from './cloudError.js';
import { createCloudStore } from './cloudStore.js';
import { firebaseConfig } from './config.js';
import type { CloudRepository, CloudUser } from './types.js';

/**
 * Lite Firestore: plain get/set, no realtime listeners, no offline cache — the cloud is only
 * touched on a button press. Every call goes through `guard`, so what escapes is a `CloudError`.
 */
export function createFirestoreRepository(): CloudRepository {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  // Dev talks to the local emulators (`npm run dev:cloud`), never the live project, so a test
  // upload cannot land beside real backups or spend the shared quota. Before any other call on
  // either, which is when the SDK requires it.
  if (import.meta.env.DEV) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
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
  const store = createCloudStore(db, uid);

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

    load: () => guard(store.load),
    upload: (...args) => guard(() => store.upload(...args)),
    deleteVersions: (...args) => guard(() => store.deleteVersions(...args)),
  };
}
