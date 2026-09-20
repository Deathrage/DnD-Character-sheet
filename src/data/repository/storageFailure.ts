import type { SchemaIssue } from '../migration/errors.js';

export type StorageFailure =
  | { code: 'QUOTA_EXCEEDED' }
  | { code: 'UNAVAILABLE'; cause: unknown }
  | { code: 'BLOCKED' }
  | { code: 'SAVE_REFUSED'; issues: SchemaIssue[] }
  | { code: 'UNKNOWN'; cause: unknown };

export class StorageError extends Error {
  constructor(readonly detail: StorageFailure) {
    super(detail.code);
    this.name = 'StorageError';
  }
}

/**
 * `InvalidStateError` and `SecurityError` are how private browsing and a blocked origin present
 * themselves; neither is retryable and both mean the same thing to a player. Anything else stays
 * UNKNOWN with its cause rather than being guessed into a category that would produce wrong advice.
 */
export function toStorageFailure(cause: unknown): StorageFailure {
  if (cause instanceof DOMException) {
    if (cause.name === 'QuotaExceededError') return { code: 'QUOTA_EXCEEDED' };
    if (cause.name === 'InvalidStateError' || cause.name === 'SecurityError') {
      return { code: 'UNAVAILABLE', cause };
    }
  }
  return { code: 'UNKNOWN', cause };
}
