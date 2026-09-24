/**
 * The Firebase web config. Public by design — it names the project, it does not authorise
 * anything; the rules in `firestore.rules` do. `authDomain` is the app's own origin, not
 * `firebaseapp.com`, so the sign-in redirect's `/__/auth/handler` is same-origin and survives
 * third-party storage partitioning.
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyD5vaH732v5iWNpQ_4kEu8kG89-UoObJkQ',
  authDomain: 'dnd-character-sheet-64a24.web.app',
  projectId: 'dnd-character-sheet-64a24',
  messagingSenderId: '544965721338',
  appId: '1:544965721338:web:cafa42944370df69b11d43',
};
