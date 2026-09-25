import { z } from 'zod';

/**
 * Layout 2 of the cloud: one document per player, `cloud/{uid}`. Strict at every level, as
 * `src/data/schema/v1/` is: an unknown key fails the read instead of being dropped. A shipped
 * layout is never edited. Adding a field means layout 3, in its own file.
 *
 * Its own primitives, not the character schema's: the same validators on purpose (uuidv4 and
 * millisecond ISO times, which AGENTS.md explains), but a copy, so a character schema change can
 * never change what a stored layout accepts.
 */
const bytes = z.instanceof(Uint8Array);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const characterId = z.uuidv4();
const uploadedAt = z.iso.datetime({ precision: 3 });

const version = z
  .object({
    /** `JSON.stringify(doc)`, gzipped. The sheet has its own `schemaVersion`; this never looks inside. */
    sheet: bytes,
    /** A key of `portraits`, or `null`. */
    portrait: sha256.nullable(),
  })
  .strict();

export const layoutV2Schema = z
  .object({
    layoutVersion: z.literal(2),
    /** Absent for a player who never uploaded a portrait: an upload never writes an empty map. */
    portraits: z.record(sha256, bytes).optional(),
    characters: z.record(characterId, z.record(uploadedAt, version)),
  })
  .strict();

export type LayoutV2 = z.infer<typeof layoutV2Schema>;
