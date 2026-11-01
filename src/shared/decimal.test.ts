import { describe, expect, it } from 'vitest';
import { addDecimals, decimalPlaces, MAX_DECIMALS, MIN_STEP } from './decimal.js';

describe('decimalPlaces', () => {
  it.each([
    [6, 0],
    [0.5, 1],
    [1.005, 3],
    [0.0001, 4],
    [1e21, 0],
  ])('counts the places of %j as %i, from its shortest text', (value, places) => {
    expect(decimalPlaces(value)).toBe(places);
  });

  // `String(1e-7)` is '1e-7', which has no point to count after; the value is still a fraction.
  // `String(NaN)` has no point either, and a non-number is not a whole number.
  it.each([1e-7, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'treats %j, which cannot be stored, as having every place',
    (value) => {
      expect(decimalPlaces(value)).toBe(Number.POSITIVE_INFINITY);
    },
  );
});

describe('addDecimals', () => {
  it('adds without float residue: 0.1 + 0.2 is exactly 0.3', () => {
    expect(addDecimals(0.1, 0.2)).toBe(0.3);
  });

  it('subtracts a step from a fraction back to a whole number', () => {
    expect(addDecimals(4.5, -0.5)).toBe(4);
  });

  it('keeps the more precise operand: 0.25 + 0.1 is 0.35, not 0.4', () => {
    expect(addDecimals(0.25, 0.1)).toBe(0.35);
  });

  it('leaves whole numbers whole', () => {
    expect(addDecimals(1, 1)).toBe(2);
    expect(addDecimals(Number.MAX_SAFE_INTEGER, -1)).toBe(Number.MAX_SAFE_INTEGER - 1);
  });
});

it('the smallest step is one unit of the last allowed place', () => {
  expect(MIN_STEP).toBe(10 ** -MAX_DECIMALS);
  expect(decimalPlaces(MIN_STEP)).toBe(MAX_DECIMALS);
});
