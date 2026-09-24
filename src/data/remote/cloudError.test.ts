import { describe, expect, it } from 'vitest';
import { CloudError, describeCloudError, toCloudError } from './cloudError.js';

/** Firebase errors are `FirebaseError`s with a string `code`; a plain object stands in for one. */
const firebaseError = (code: string) => Object.assign(new Error(code), { code });

describe('toCloudError', () => {
  it.each([
    ['unavailable', 'OFFLINE'],
    ['deadline-exceeded', 'OFFLINE'],
    ['auth/network-request-failed', 'OFFLINE'],
    ['permission-denied', 'PERMISSION_DENIED'],
    ['unauthenticated', 'PERMISSION_DENIED'],
    ['resource-exhausted', 'QUOTA'],
    ['auth/popup-closed-by-user', 'CANCELLED'],
    ['auth/cancelled-popup-request', 'CANCELLED'],
    ['not-found', 'NOT_FOUND'],
    ['internal', 'UNKNOWN'],
  ])('maps %s to %s', (code, expected) => {
    expect(toCloudError(firebaseError(code)).code).toBe(expected);
  });

  it('keeps a CloudError as it is', () => {
    const error = new CloudError('SIGNED_OUT');
    expect(toCloudError(error)).toBe(error);
  });

  it('keeps the original as the cause, so an UNKNOWN is still diagnosable', () => {
    const original = new TypeError('Failed to fetch dynamically imported module');
    expect(toCloudError(original)).toMatchObject({ code: 'UNKNOWN', cause: original });
  });

  it('has a sentence for every code', () => {
    for (const code of [
      'OFFLINE',
      'SIGNED_OUT',
      'PERMISSION_DENIED',
      'QUOTA',
      'CANCELLED',
      'NOT_FOUND',
      'UNKNOWN',
    ] as const) {
      expect(describeCloudError(new CloudError(code))).toMatch(/\.$/);
    }
  });
});
