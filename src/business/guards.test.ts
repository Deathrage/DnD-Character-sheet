import { describe, expect, it } from 'vitest';
import { RuleViolation } from './errors.js';
import {
  integer,
  longText,
  MAX_CATEGORY_NAME,
  MAX_LONG_TEXT,
  MAX_SHORT_NAME,
  nonNegativeInt,
  trimmedName,
} from './guards.js';

describe('trimmedName', () => {
  it('trims, because the schema rejects padding rather than removing it', () => {
    expect(trimmedName('  Sable  ')).toBe('Sable');
  });

  it('preserves internal whitespace', () => {
    expect(trimmedName('Sable Nightwind')).toBe('Sable Nightwind');
  });

  it.each(['', '   ', '\t\n'])('rejects %j as empty', (value) => {
    expect(() => trimmedName(value)).toThrow(
      expect.objectContaining({ code: 'EMPTY_NAME' }) as Error,
    );
  });
});

// The cap is the schema's, mirrored here: a name one character over makes the whole document
// unparseable, and autosave validates then refuses, so a single long paste would stop saving for
// that character until something repaired it.
describe('trimmedName length', () => {
  it('accepts a name exactly at the cap', () => {
    expect(trimmedName('x'.repeat(MAX_SHORT_NAME))).toHaveLength(MAX_SHORT_NAME);
  });

  it('rejects one character over as TOO_LONG', () => {
    expect(() => trimmedName('x'.repeat(MAX_SHORT_NAME + 1))).toThrow(
      expect.objectContaining({ code: 'TOO_LONG' }) as Error,
    );
  });

  it('measures the trimmed length, not the padded one', () => {
    expect(trimmedName(`   ${'x'.repeat(MAX_SHORT_NAME)}   `)).toHaveLength(MAX_SHORT_NAME);
  });

  it('takes the shorter cap a category name is held to', () => {
    const name = 'x'.repeat(MAX_CATEGORY_NAME + 1);
    expect(trimmedName(name)).toBe(name);
    expect(() => trimmedName(name, MAX_CATEGORY_NAME)).toThrow(
      expect.objectContaining({ code: 'TOO_LONG' }) as Error,
    );
  });
});

describe('longText', () => {
  it('accepts text exactly at the cap', () => {
    expect(longText('x'.repeat(MAX_LONG_TEXT))).toHaveLength(MAX_LONG_TEXT);
  });

  it('rejects one character over as TOO_LONG', () => {
    expect(() => longText('x'.repeat(MAX_LONG_TEXT + 1))).toThrow(
      expect.objectContaining({ code: 'TOO_LONG' }) as Error,
    );
  });

  it('does not trim, because leading whitespace in prose may be deliberate', () => {
    expect(longText('  indented')).toBe('  indented');
  });
});

describe('integer', () => {
  it.each([0, -3, 42])('accepts %i', (value) => {
    expect(integer(value)).toBe(value);
  });

  it.each([1.5, NaN, Infinity])('rejects %j as NOT_AN_INTEGER', (value) => {
    expect(() => integer(value)).toThrow(
      expect.objectContaining({ code: 'NOT_AN_INTEGER' }) as Error,
    );
  });
});

describe('nonNegativeInt', () => {
  it('accepts zero', () => {
    expect(nonNegativeInt(0)).toBe(0);
  });

  it('rejects a negative integer as NEGATIVE, not NOT_AN_INTEGER', () => {
    expect(() => nonNegativeInt(-1)).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
  });

  it('rejects a non-integer as NOT_AN_INTEGER, so the codes stay distinguishable', () => {
    expect(() => nonNegativeInt(1.5)).toThrow(
      expect.objectContaining({ code: 'NOT_AN_INTEGER' }) as Error,
    );
  });

  it('throws RuleViolation, not a bare Error', () => {
    expect(() => nonNegativeInt(-1)).toThrow(RuleViolation);
  });
});
