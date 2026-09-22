import { RuleViolation } from './errors.js';

/**
 * Trims at the write boundary, then rejects an empty result. The schema rejects a padded name
 * rather than trimming it, because `parseCharacter` returns the parsed value and trimming on
 * load would silently rewrite a stored document. Trimming here is not a surprise: the player
 * just typed it.
 */
export function trimmedName(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new RuleViolation('EMPTY_NAME', 'a name must not be empty');
  }
  return trimmed;
}

/**
 * A safety net against a business-layer bug, not input validation. The UI contract is that a
 * numeric input holds its half-typed text locally and calls a setter only once it parses.
 */
export function integer(value: number): number {
  if (!Number.isInteger(value)) {
    throw new RuleViolation('NOT_AN_INTEGER', `expected an integer, got ${value}`);
  }
  return value;
}

export function nonNegativeInt(value: number): number {
  if (integer(value) < 0) {
    throw new RuleViolation('NEGATIVE', `expected a non-negative integer, got ${value}`);
  }
  return value;
}
