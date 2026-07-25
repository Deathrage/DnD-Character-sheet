import { z } from 'zod';

export const MAX_SHORT_NAME = 80;
export const MAX_CATEGORY_NAME = 40;
export const MAX_LONG_TEXT = 20_000;

/** Names are trimmed and must survive trimming. */
export const shortName = z.string().trim().min(1).max(MAX_SHORT_NAME);
export const categoryName = z.string().trim().min(1).max(MAX_CATEGORY_NAME);

/** Freeform prose. Not trimmed — leading whitespace may be deliberate. */
export const longText = z.string().max(MAX_LONG_TEXT);

export const nonNegativeInt = z.number().int().min(0);

/** The only signed fields are the three modifiers (spec §3.3). */
export const signedInt = z.number().int();

/** A hit-die size as it appears in JSON: digits, no leading zero. */
export const dieSizeKey = z
  .string()
  .regex(/^[1-9]\d*$/, 'must be a positive integer without a leading zero');

// The bare z.uuid() / z.iso.datetime() helpers look like the obvious choice here, but
// both are looser than what this app actually produces, and either would silently widen
// what a character file is allowed to contain:
//   - z.uuid() accepts any RFC version (1-8) and special-cases the nil UUID
//     (00000000-0000-0000-0000-000000000000) as valid. Every id in this app comes from
//     crypto.randomUUID(), which only ever emits version 4, so z.uuidv4() is the accurate
//     constraint — it also has no nil-UUID special case, so a zeroed-out id is rejected.
//   - z.iso.datetime() with no options accepts 0, 1, or 6 fractional-second digits. Every
//     timestamp in this app comes from Date.toISOString(), which always emits exactly 3,
//     so { precision: 3 } is the accurate constraint. As a bonus over a hand-rolled regex,
//     it also rejects calendar-impossible values (month 13, hour 99).
export const uuid = z.uuidv4();

export const isoDateTime = z.iso.datetime({ precision: 3 });

/** `current` is deliberately not checked against `total` (spec §3.2). */
export const currentAndTotal = z.object({
  current: nonNegativeInt,
  total: nonNegativeInt,
});

export const nameAndDescription = z.object({
  name: shortName,
  description: longText,
});

/**
 * Categorized<T> (spec §3.2). Display order is object-key insertion order,
 * so there is no order array — see §3.4.
 */
export const categorized = <Item extends z.ZodTypeAny>(item: Item) =>
  z.object({
    categories: z.record(categoryName, z.array(item)),
    uncategorized: z.array(item),
  });
