import { MAX_PORTRAIT, portraitSchema } from '../data/repository/portrait.js';
import { RuleViolation } from './errors.js';

// Duplicated rather than imported: `src/business/` may not import a schema version directory
// (lint forbids it), and these are facts about one schema version rather than about this layer.
// They mirror MAX_SHORT_NAME, MAX_CATEGORY_NAME and MAX_LONG_TEXT in
// `src/data/schema/v1/primitives.ts`; if v2 changed a limit, these would need changing too —
// which is the point, since the business layer would need deliberate updating either way. This
// is the same treatment `SPELL_SLOT_LEVELS` gets in `counters.ts`.
export const MAX_SHORT_NAME = 80;
export const MAX_CATEGORY_NAME = 40;
export const MAX_LONG_TEXT = 20_000;

/**
 * Trims at the write boundary, then rejects an empty result. The schema rejects a padded name
 * rather than trimming it, because `parseCharacter` returns the parsed value and trimming on
 * load would silently rewrite a stored document. Trimming here is not a surprise: the player
 * just typed it.
 *
 * The length cap is not cosmetic: a name the schema rejects makes the whole document
 * unparseable on load, so one long paste would stop autosave for that character until something
 * repaired it. `max` is `MAX_SHORT_NAME` for every name but a category's, which is shorter.
 */
export function trimmedName(value: string, max: number = MAX_SHORT_NAME): string {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new RuleViolation('EMPTY_NAME', 'a name must not be empty');
  }
  if (trimmed.length > max) {
    throw new RuleViolation(
      'TOO_LONG',
      `a name must be at most ${max} characters, got ${trimmed.length}`,
    );
  }
  return trimmed;
}

/** Freeform prose: not trimmed — leading whitespace may be deliberate — but still capped. */
export function longText(value: string): string {
  if (value.length > MAX_LONG_TEXT) {
    throw new RuleViolation(
      'TOO_LONG',
      `text must be at most ${MAX_LONG_TEXT} characters, got ${value.length}`,
    );
  }
  return value;
}

/**
 * A base64 JPEG data URL, capped — the repository would refuse anything else. Imported rather
 * than duplicated like the limits above: the portrait's rule is not a fact about a schema
 * version, so it lives outside the version directories this layer may not reach.
 */
export function portrait(value: string): string {
  if (value.length > MAX_PORTRAIT) {
    throw new RuleViolation(
      'TOO_LONG',
      `an image must be at most ${MAX_PORTRAIT} characters, got ${value.length}`,
    );
  }
  if (!portraitSchema.safeParse(value).success) {
    throw new RuleViolation('INVALID_IMAGE', 'expected a base64 JPEG data URL');
  }
  return value;
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

/** A class level: a class you have no levels in is a class you do not have. */
export function positiveInt(value: number): number {
  if (integer(value) < 1) {
    throw new RuleViolation('BELOW_ONE', `expected an integer of at least 1, got ${value}`);
  }
  return value;
}

/**
 * `except` is the node being renamed, so renaming something to its own name is not a duplicate.
 * `noun` names what is being added, so the message reads as the caller's own.
 */
export function rejectDuplicate<TData extends { name: string }>(
  entries: readonly TData[],
  name: string,
  except: TData | null,
  noun: string,
): void {
  if (entries.some((entry) => entry !== except && entry.name === name)) {
    throw new RuleViolation('DUPLICATE_NAME', `a ${noun} named "${name}" already exists`);
  }
}
