import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MAX_CATEGORY_NAME,
  MAX_LONG_TEXT,
  MAX_SHORT_NAME,
  categorized,
  categoryName,
  currentAndTotal,
  dieSizeKey,
  isoDateTime,
  longText,
  nameAndDescription,
  nonNegativeInt,
  shortName,
  uuid,
} from './primitives.js';

describe('shortName', () => {
  it('trims surrounding whitespace', () => {
    expect(shortName.parse('  Sable  ')).toBe('Sable');
  });

  it('rejects a value that is empty after trimming', () => {
    expect(shortName.safeParse('   ').success).toBe(false);
  });

  it(`accepts exactly ${MAX_SHORT_NAME} characters and rejects one more`, () => {
    expect(shortName.safeParse('a'.repeat(MAX_SHORT_NAME)).success).toBe(true);
    expect(shortName.safeParse('a'.repeat(MAX_SHORT_NAME + 1)).success).toBe(false);
  });
});

describe('categoryName', () => {
  it(`accepts exactly ${MAX_CATEGORY_NAME} characters and rejects one more`, () => {
    expect(categoryName.safeParse('a'.repeat(MAX_CATEGORY_NAME)).success).toBe(true);
    expect(categoryName.safeParse('a'.repeat(MAX_CATEGORY_NAME + 1)).success).toBe(false);
  });

  it('accepts a purely numeric name, which merely sorts first (spec §3.4)', () => {
    expect(categoryName.safeParse('1').success).toBe(true);
  });
});

describe('longText', () => {
  it('accepts an empty string', () => {
    expect(longText.parse('')).toBe('');
  });

  it('does not trim, because leading indentation may be meaningful', () => {
    expect(longText.parse('  indented')).toBe('  indented');
  });

  it(`rejects more than ${MAX_LONG_TEXT} characters`, () => {
    expect(longText.safeParse('a'.repeat(MAX_LONG_TEXT + 1)).success).toBe(false);
  });
});

describe('nonNegativeInt', () => {
  it.each([0, 1, 9999])('accepts %i', (value) => {
    expect(nonNegativeInt.parse(value)).toBe(value);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %p', (value) => {
    expect(nonNegativeInt.safeParse(value).success).toBe(false);
  });
});

describe('dieSizeKey', () => {
  it.each(['1', '8', '12', '100'])('accepts %s', (value) => {
    expect(dieSizeKey.parse(value)).toBe(value);
  });

  it.each(['0', '08', '', 'd8', '-8', '8.5'])('rejects %p', (value) => {
    expect(dieSizeKey.safeParse(value).success).toBe(false);
  });
});

describe('uuid and isoDateTime', () => {
  it('accepts a crypto.randomUUID() value', () => {
    expect(uuid.safeParse(crypto.randomUUID()).success).toBe(true);
  });

  it('rejects a non-uuid string', () => {
    expect(uuid.safeParse('not-a-uuid').success).toBe(false);
  });

  it('accepts a Date.toISOString() value', () => {
    expect(isoDateTime.safeParse(new Date('2026-07-25T09:41:00.000Z').toISOString()).success).toBe(
      true,
    );
  });

  it('rejects a local-time string with no zone', () => {
    expect(isoDateTime.safeParse('2026-07-25 09:41').success).toBe(false);
  });
});

describe('currentAndTotal', () => {
  it('permits current above total, which is deliberate (spec §3.2)', () => {
    expect(currentAndTotal.parse({ current: 12, total: 4 })).toEqual({ current: 12, total: 4 });
  });

  it('rejects a negative current', () => {
    expect(currentAndTotal.safeParse({ current: -1, total: 4 }).success).toBe(false);
  });
});

describe('nameAndDescription', () => {
  it('requires both fields', () => {
    expect(nameAndDescription.safeParse({ name: 'Sneak Attack' }).success).toBe(false);
  });
});

describe('categorized', () => {
  const schema = categorized(nameAndDescription);

  it('accepts categories plus an uncategorized bucket', () => {
    const value = {
      categories: { Rogue: [{ name: 'Sneak Attack', description: '+3d6.' }] },
      uncategorized: [{ name: 'Darkvision', description: '60 ft.' }],
    };
    expect(schema.parse(value)).toEqual(value);
  });

  it('accepts an empty structure', () => {
    expect(schema.parse({ categories: {}, uncategorized: [] })).toEqual({
      categories: {},
      uncategorized: [],
    });
  });

  it('rejects a category name that is too long', () => {
    const value = {
      categories: { ['a'.repeat(MAX_CATEGORY_NAME + 1)]: [] },
      uncategorized: [],
    };
    expect(schema.safeParse(value).success).toBe(false);
  });

  it('preserves key insertion order through a JSON round-trip (spec §3.4)', () => {
    const value = {
      categories: { Zebra: [], Apple: [], Middle: [] },
      uncategorized: [],
    };
    const roundTripped = schema.parse(JSON.parse(JSON.stringify(value)));
    expect(Object.keys(roundTripped.categories)).toEqual(['Zebra', 'Apple', 'Middle']);
  });

  it('is a ZodObject, so document sections can extend it', () => {
    expect(schema).toBeInstanceOf(z.ZodObject);
  });
});
