/**
 * The arithmetic behind a counter that counts in parts (schema v7). In `shared/` because the
 * business layer's guard and the UI's number field both need it: the guard to refuse a fourth
 * decimal place, the field to step 0.1 from 0.2 and land on 0.3 rather than 0.30000000000000004.
 *
 * The schema does not import this. Version directories share nothing (`schema/README.md`), so
 * `v7/` carries its own copy of the three-place rule as a regex.
 */

/** The most decimal places a stored counter value may have. */
export const MAX_DECIMALS = 3;

/** The smallest step those places can express. */
export const MIN_STEP = 10 ** -MAX_DECIMALS;

/**
 * How many decimal places a value has, read from its shortest round-trip text — the same text
 * the schema checks and the raw-JSON editor shows. 0 for a whole number. A fraction too small
 * to print without an exponent has, for every purpose here, more places than can be stored.
 */
export function decimalPlaces(value: number): number {
  const text = String(value);
  if (/e/i.test(text)) {
    return Number.isInteger(value) ? 0 : Number.POSITIVE_INFINITY;
  }
  const point = text.indexOf('.');
  return point === -1 ? 0 : text.length - point - 1;
}

/**
 * `a + b`, rounded to the more precise of the two. Binary floats cannot hold 0.1 or 0.2 exactly,
 * so their sum carries residue in the sixteenth place; rounding to the first, the place both
 * operands actually have, gives the 0.3 the player expects. Rounding never invents a place: 0.25
 * plus 0.1 keeps the second place and is 0.35.
 */
export function addDecimals(a: number, b: number): number {
  const places = Math.max(decimalPlaces(a), decimalPlaces(b));
  if (!Number.isFinite(places)) return a + b;
  const scale = 10 ** places;
  return Math.round((a + b) * scale) / scale;
}
