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

// Explicit regexes rather than z.string().uuid() / z.iso.datetime(): those helpers
// moved between Zod 3 and 4, and this keeps the schema valid on either.
export const uuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'must be a UUID',
  );

export const isoDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/, 'must be an ISO 8601 UTC timestamp');

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
