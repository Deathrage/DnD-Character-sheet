import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The SDK is mocked whole: what these tests pin is how Auth is wired, not what Firebase does.
 * `vi.hoisted` because `vi.mock` factories run before the imports below are evaluated.
 */
const sdk = vi.hoisted(() => {
  const auth = { currentUser: null, authStateReady: () => Promise.resolve() };
  const user = {
    uid: 'uid-1',
    displayName: 'Dev Player',
    email: 'dev@example.com',
    photoURL: null,
  };
  return {
    auth,
    user,
    initializeApp: vi.fn(() => ({ name: 'app' })),
    initializeAuth: vi.fn<
      (
        app: unknown,
        options: { persistence: unknown; popupRedirectResolver?: unknown },
      ) => typeof auth
    >(() => auth),
    getAuth: vi.fn(() => auth),
    getRedirectResult: vi.fn<(auth: unknown, resolver?: unknown) => Promise<null>>(() =>
      Promise.resolve(null),
    ),
    signInWithPopup: vi.fn<
      (auth: unknown, provider: unknown, resolver?: unknown) => Promise<{ user: typeof user }>
    >(() => Promise.resolve({ user })),
    signInWithRedirect: vi.fn<
      (auth: unknown, provider: unknown, resolver?: unknown) => Promise<void>
    >(() => Promise.resolve()),
    browserLocalPersistence: { type: 'LOCAL', kind: 'localStorage' },
    browserSessionPersistence: { type: 'SESSION', kind: 'sessionStorage' },
    indexedDBLocalPersistence: { type: 'LOCAL', kind: 'indexedDB' },
    browserPopupRedirectResolver: { kind: 'resolver' },
  };
});

vi.mock('firebase/app', () => ({ initializeApp: sdk.initializeApp }));
vi.mock('firebase/auth', () => ({
  browserLocalPersistence: sdk.browserLocalPersistence,
  browserPopupRedirectResolver: sdk.browserPopupRedirectResolver,
  browserSessionPersistence: sdk.browserSessionPersistence,
  connectAuthEmulator: vi.fn(),
  getAuth: sdk.getAuth,
  getRedirectResult: sdk.getRedirectResult,
  GoogleAuthProvider: class GoogleAuthProvider {},
  indexedDBLocalPersistence: sdk.indexedDBLocalPersistence,
  initializeAuth: sdk.initializeAuth,
  signInWithPopup: sdk.signInWithPopup,
  signInWithRedirect: sdk.signInWithRedirect,
  signOut: vi.fn(),
}));
vi.mock('firebase/firestore/lite', () => ({
  connectFirestoreEmulator: vi.fn(),
  getFirestore: vi.fn(() => ({ name: 'db' })),
}));
vi.mock('./cloudStore.js', () => ({ createCloudStore: vi.fn(() => ({})) }));

import { createFirestoreRepository } from './firestoreRepository.js';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/**
 * On a mobile browser, Auth initialises a resolver it is handed at construction straight away:
 * Google's gapi scripts and the hidden auth iframe, about 400 KB of script on the main thread
 * the moment the first sheet of a launch loads Firebase. Constructed without one, Auth loads
 * nothing of that; the resolver is passed to the calls that need it, and `getRedirectResult`
 * then opens the iframe only when a redirect is actually pending.
 */
describe('createFirestoreRepository', () => {
  it('initialises Auth without the redirect resolver, keeping getAuth’s own persistence', () => {
    createFirestoreRepository();

    expect(sdk.getAuth).not.toHaveBeenCalled();
    expect(sdk.initializeAuth).toHaveBeenCalledTimes(1);
    const [app, options] = sdk.initializeAuth.mock.calls[0]!;
    expect(app).toBe(sdk.initializeApp.mock.results[0]?.value);
    expect(options).not.toHaveProperty('popupRedirectResolver');
    // The same list, in the same order, as `getAuth` installs — so no stored sign-in is lost.
    expect(options.persistence).toEqual([
      sdk.indexedDBLocalPersistence,
      sdk.browserLocalPersistence,
      sdk.browserSessionPersistence,
    ]);
  });

  it('hands the resolver to getRedirectResult, which needs it to finish a redirect sign-in', () => {
    createFirestoreRepository();

    expect(sdk.getRedirectResult).toHaveBeenCalledWith(sdk.auth, sdk.browserPopupRedirectResolver);
  });

  it('hands the resolver to the popup sign-in used in dev', async () => {
    vi.stubEnv('DEV', true);
    const repository = createFirestoreRepository();

    await expect(repository.signIn()).resolves.toEqual({
      uid: 'uid-1',
      name: 'Dev Player',
      email: 'dev@example.com',
      photoUrl: null,
    });
    expect(sdk.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(sdk.signInWithPopup.mock.calls[0]?.[2]).toBe(sdk.browserPopupRedirectResolver);
    expect(sdk.signInWithRedirect).not.toHaveBeenCalled();
  });

  it('hands the resolver to the redirect sign-in used in production', async () => {
    vi.stubEnv('DEV', false);
    const repository = createFirestoreRepository();

    await repository.signIn();
    expect(sdk.signInWithRedirect).toHaveBeenCalledTimes(1);
    expect(sdk.signInWithRedirect.mock.calls[0]?.[2]).toBe(sdk.browserPopupRedirectResolver);
    expect(sdk.signInWithPopup).not.toHaveBeenCalled();
  });
});
