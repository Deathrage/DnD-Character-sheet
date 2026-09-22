import { describe, expect, it } from 'vitest';
import { RuleViolation } from './errors.js';
import { integer, nonNegativeInt, trimmedName } from './guards.js';

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
