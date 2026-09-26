import { describe, expect, it } from 'vitest';
import { createCharacter } from '../data/schema/index.js';
import { RuleViolation } from './errors.js';
import {
  ABILITY_KEYS,
  abilityKey,
  damageText,
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

describe('abilityKey', () => {
  it.each(ABILITY_KEYS)('accepts %s', (key) => {
    expect(abilityKey(key)).toBe(key);
  });

  it.each(['STR', 'luck', ''])('rejects %j as UNKNOWN_ABILITY', (value) => {
    expect(() => abilityKey(value)).toThrow(
      expect.objectContaining({ code: 'UNKNOWN_ABILITY' }) as Error,
    );
  });

  // The tuple is duplicated from the schema version on purpose (a layer may not import a version
  // directory). This is what makes the duplicate honest: a missing, extra or reordered ability
  // fails here instead of passing silently.
  it('lists exactly the abilities a blank document has, in its order', () => {
    const doc = createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date(),
    });
    expect([...ABILITY_KEYS]).toEqual(Object.keys(doc.abilitiesAndSkills.abilities));
  });
});

describe('damageText', () => {
  it('trims at the write boundary, as a name is trimmed', () => {
    expect(damageText('  1d8+3 piercing ')).toBe('1d8+3 piercing');
  });

  it('allows an empty result, unlike a name: no damage entered yet', () => {
    expect(damageText('   ')).toBe('');
  });

  it('accepts 80 characters and refuses 81 as TOO_LONG, after trimming', () => {
    expect(damageText(` ${'x'.repeat(MAX_SHORT_NAME)} `)).toHaveLength(MAX_SHORT_NAME);
    expect(() => damageText('x'.repeat(MAX_SHORT_NAME + 1))).toThrow(
      expect.objectContaining({ code: 'TOO_LONG' }) as Error,
    );
  });
});
