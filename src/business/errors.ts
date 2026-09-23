/**
 * Every rule this layer enforces. Most mean a UI bug and should be loud; DUPLICATE_NAME is the
 * one the UI is expected to catch and present, because a player can type a name that is already
 * in use and deserves a message rather than a crash.
 */
export type RuleCode =
  | 'DUPLICATE_NAME'
  | 'EMPTY_NAME'
  | 'DUPLICATE_DIE'
  | 'NOT_AN_INTEGER'
  | 'NEGATIVE'
  | 'BELOW_ONE'
  | 'TOO_LONG'
  | 'UNKNOWN_CATEGORY'
  | 'INVALID_DIE_SIZE'
  | 'GONE';

export class RuleViolation extends Error {
  constructor(
    readonly code: RuleCode,
    message: string,
  ) {
    super(message);
    this.name = 'RuleViolation';
  }
}

/**
 * Re-exported, not redefined. `ui` may not import `data` (spec §2), so without this the sentence
 * describing why a stored document would not load could never reach the screen that has to show
 * it — and a damaged character would be listed with no explanation, which is the one thing
 * acceptance criterion 15 forbids.
 *
 * It stays a function rather than becoming a method on `CharacterEntryBO`: `entry.problem` is
 * its only caller, and a `describe()` method on an object whose job is to *be* the description
 * would be one indirection for nothing.
 */
export { describeLoadError } from '../data/migration/errors.js';
export type { LoadError, SchemaIssue } from '../data/migration/errors.js';

/**
 * Also re-exported for `ui`: the repository is what knows a write failed and why, but the gate
 * and the failure banner are on screen, on the other side of a boundary `ui` may not cross.
 */
export type { StorageFailure } from '../data/repository/storageFailure.js';
import type { StorageFailure } from '../data/repository/storageFailure.js';

/**
 * The sentence for a storage failure, beside `describeLoadError` for the same reason: the shape
 * lives in `data`, the screen that must explain it lives in `ui`, and `ui` may not import `data`.
 *
 * `SAVE_REFUSED` reads differently from the rest on purpose. Spec §6 requires it be loud, because
 * it means a business-layer bug wrote something the schema rejects — with §3.6's guards in place
 * it should be unreachable, which is exactly why reaching it must not look like a normal hiccup.
 */
export function describeStorageFailure(failure: StorageFailure): string {
  switch (failure.code) {
    case 'QUOTA_EXCEEDED':
      return 'This browser is out of space for this app, so the last change was not saved. Export this character, then delete one you no longer need.';
    case 'UNAVAILABLE':
      return 'This browser is not letting the app store anything — private browsing usually does this. Nothing you change here will be kept.';
    case 'BLOCKED':
      return 'Another tab of this app is holding storage open. Close the other tabs and reload.';
    case 'SAVE_REFUSED':
      return `A change was refused because it would have written an invalid character, so nothing was saved. This is a bug in the app, not in your file. ${failure.issues
        .map((issue) => (issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`))
        .join('; ')}`;
    case 'UNKNOWN':
      return 'Saving failed for an unexpected reason. Export this character so you have a copy.';
  }
}
