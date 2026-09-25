import { formatBytes } from '../../shared/formatBytes.js';
import type { LoadError } from '../migration/errors.js';

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
  'auth/redirect-cancelled-by-user': 'CANCELLED',
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

export function describeLayoutError(error: LoadError): string {
  return error.code === 'FROM_FUTURE'
    ? 'Your cloud backups were made by a newer version of the app. Reload to update.'
    : 'Your cloud backups could not be read. Nothing in the cloud was changed.';
}

export function describeFull(neededBytes: number, freeBytes: number): string {
  return `Not enough cloud space: this version needs ${formatBytes(neededBytes)} and ${formatBytes(Math.max(0, freeBytes))} is free. Delete old versions on the Cloud screen to make room.`;
}
