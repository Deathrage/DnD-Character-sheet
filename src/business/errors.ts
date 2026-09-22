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
  | 'UNKNOWN_CATEGORY'
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
