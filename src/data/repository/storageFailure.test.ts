import { describe, expect, it } from 'vitest';
import { toStorageFailure } from './storageFailure.js';

describe('toStorageFailure', () => {
  it.each([
    ['QuotaExceededError', 'QUOTA_EXCEEDED'],
    ['InvalidStateError', 'UNAVAILABLE'],
    ['SecurityError', 'UNAVAILABLE'],
    ['UnknownError', 'UNKNOWN'],
  ])('maps a %s DOMException to %s', (name, code) => {
    expect(toStorageFailure(new DOMException('boom', name)).code).toBe(code);
  });

  it('keeps the cause, so a bug report can name the original error', () => {
    const cause = new DOMException('boom', 'InvalidStateError');
    expect(toStorageFailure(cause)).toMatchObject({ code: 'UNAVAILABLE', cause });
  });

  it('maps a non-DOMException to UNKNOWN rather than guessing', () => {
    const cause = new TypeError('not a storage problem');
    expect(toStorageFailure(cause)).toMatchObject({ code: 'UNKNOWN', cause });
  });
});
