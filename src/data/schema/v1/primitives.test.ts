// Schema v1 is frozen: these tests lock in what a v1 character document was allowed to be.
// Editing an assertion here to let new code pass is editing v1's meaning — see
// ../README.md#when-the-freeze-begins for what "frozen" means and when it starts applying.

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
  signedInt,
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

describe('signedInt', () => {
  it.each([-9999, -1, 0, 1, 9999])('accepts %i', (value) => {
    expect(signedInt.parse(value)).toBe(value);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects %p',
    (value) => {
      expect(signedInt.safeParse(value).success).toBe(false);
    },
  );
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

  it('rejects the nil UUID, which z.uuid() would wrongly accept', () => {
    // This is the case that specifically catches z.uuidv4() being "simplified" to z.uuid():
    // z.uuid() special-cases 00000000-0000-0000-0000-000000000000 as valid; uuidv4 does not.
    expect(uuid.safeParse('00000000-0000-0000-0000-000000000000').success).toBe(false);
  });

  it('rejects a bad version nibble, otherwise correctly shaped', () => {
    // Version nibble (3rd group, 1st char) must be exactly 4; '6' is out of range.
    expect(uuid.safeParse('aaaaaaaa-aaaa-6aaa-8aaa-aaaaaaaaaaaa').success).toBe(false);
  });

  it('rejects a bad variant nibble, otherwise correctly shaped', () => {
    // Variant nibble (4th group, 1st char) must be 8/9/a/b; 'c' is out of range.
    // Version nibble is a valid '4' so this case is isolated to the variant alone.
    expect(uuid.safeParse('aaaaaaaa-aaaa-4aaa-caaa-aaaaaaaaaaaa').success).toBe(false);
  });

  it('rejects a wrong-length group, otherwise correctly shaped', () => {
    // 2nd group has 3 hex digits instead of the required 4.
    expect(uuid.safeParse('aaaaaaaa-aaa-4aaa-8aaa-aaaaaaaaaaaa').success).toBe(false);
  });

  it('rejects a non-hex character, otherwise correctly shaped', () => {
    // Last character of the final group is 'z', which is not a hex digit.
    expect(uuid.safeParse('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaz').success).toBe(false);
  });

  it('accepts a Date.toISOString() value', () => {
    expect(isoDateTime.safeParse(new Date('2026-07-25T09:41:00.000Z').toISOString()).success).toBe(
      true,
    );
  });

  it('rejects a local-time string with no zone', () => {
    expect(isoDateTime.safeParse('2026-07-25 09:41').success).toBe(false);
  });

  it('rejects a value with no trailing Z, otherwise correctly shaped', () => {
    expect(isoDateTime.safeParse('2026-07-25T09:41:00.000').success).toBe(false);
  });

  it('rejects a non-UTC offset in place of Z', () => {
    expect(isoDateTime.safeParse('2026-07-25T09:41:00.000+02:00').success).toBe(false);
  });

  it('rejects the wrong number of millisecond digits', () => {
    expect(isoDateTime.safeParse('2026-07-25T09:41:00.00Z').success).toBe(false);
  });

  it('rejects a value with no milliseconds at all', () => {
    expect(isoDateTime.safeParse('2026-07-25T09:41:00Z').success).toBe(false);
  });

  it('rejects an impossible month, which a hand-rolled regex would not catch', () => {
    expect(isoDateTime.safeParse('2026-13-01T09:41:00.000Z').success).toBe(false);
  });

  it('rejects an impossible hour, which a hand-rolled regex would not catch', () => {
    expect(isoDateTime.safeParse('2026-07-25T99:41:00.000Z').success).toBe(false);
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
