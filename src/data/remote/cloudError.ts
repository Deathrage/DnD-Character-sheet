export type CloudFailure =
  'OFFLINE' | 'SIGNED_OUT' | 'PERMISSION_DENIED' | 'QUOTA' | 'CANCELLED' | 'NOT_FOUND' | 'UNKNOWN';

/** Every cloud failure, whichever Firebase product raised it, so no Firebase type escapes. */
export class CloudError extends Error {
  constructor(
    readonly code: CloudFailure,
    cause?: unknown,
  ) {
    super(code, { cause });
    this.name = 'CloudError';
  }
}

/** Firestore's and Auth's codes (checked against firebase@12.19.0's `FirestoreErrorCode`). */
const CODES: Readonly<Record<string, CloudFailure>> = {
  unavailable: 'OFFLINE',
  'deadline-exceeded': 'OFFLINE',
  'auth/network-request-failed': 'OFFLINE',
  'permission-denied': 'PERMISSION_DENIED',
  unauthenticated: 'PERMISSION_DENIED',
  'resource-exhausted': 'QUOTA',
  'auth/popup-closed-by-user': 'CANCELLED',
  'auth/cancelled-popup-request': 'CANCELLED',
  'not-found': 'NOT_FOUND',
};

/** Read structurally, so this file needs no `firebase` import and is tested under Node. */
export function toCloudError(caught: unknown): CloudError {
  if (caught instanceof CloudError) return caught;
  const code =
    typeof caught === 'object' && caught !== null && 'code' in caught ? caught.code : undefined;
  return new CloudError((typeof code === 'string' && CODES[code]) || 'UNKNOWN', caught);
}

export function describeCloudError(error: CloudError): string {
  switch (error.code) {
    case 'OFFLINE':
      return 'The cloud could not be reached. Check your connection and try again.';
    case 'SIGNED_OUT':
      return 'Sign in with Google to use cloud backup.';
    case 'PERMISSION_DENIED':
      return 'The cloud refused this account. Sign out, sign in again, and retry.';
    case 'QUOTA':
      return 'Cloud backup is out of free capacity for today. Try again tomorrow.';
    case 'CANCELLED':
      return 'Sign-in was cancelled.';
    case 'NOT_FOUND':
      return 'This version is no longer in the cloud.';
    case 'UNKNOWN':
      return 'Cloud backup failed unexpectedly. Try again.';
  }
}
