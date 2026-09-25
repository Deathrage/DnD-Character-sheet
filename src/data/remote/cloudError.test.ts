import { describe, expect, it } from 'vitest';
import {
  CloudError,
  describeCloudError,
  describeFull,
  describeLayoutError,
  toCloudError,
} from './cloudError.js';

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
    ['auth/redirect-cancelled-by-user', 'CANCELLED'],
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

  it('describes a cloud document from a newer layout, and any other that will not load', () => {
    expect(describeLayoutError({ code: 'FROM_FUTURE', found: 3, current: 2 })).toBe(
      'Your cloud backups were made by a newer version of the app. Reload to update.',
    );
    expect(describeLayoutError({ code: 'UNVERSIONED' })).toBe(
      'Your cloud backups could not be read. Nothing in the cloud was changed.',
    );
  });

  it('says how much a version needs and how much is free', () => {
    expect(describeFull(19_600, 12_000)).toBe(
      'Not enough cloud space: this version needs 19.6 KB and 12.0 KB is free. Delete old versions on the Cloud screen to make room.',
    );
    expect(describeFull(19_600, -5)).toMatch(/and 0\.0 KB is free/);
  });
});
