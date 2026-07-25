import { z } from 'zod';
import { characterDocumentV1Schema, type CharacterDocumentV1 } from './v1/index.js';

/** The version this build writes. Bump when adding a schema version. */
export const CURRENT = 1;

/** Every historical schema, keyed by its version, for stepwise migration (spec §4). */
export const SCHEMAS: Readonly<Record<number, z.ZodTypeAny>> = {
  1: characterDocumentV1Schema,
};

/** The shape the business layer always sees. */
export type CharacterDocument = CharacterDocumentV1;

export { characterDocumentV1Schema, type CharacterDocumentV1 };

// Deliberately not re-exported here: ABILITY_KEYS, SKILL_KEYS, SPELL_SLOT_LEVELS. They are v1
// facts, not version-neutral ones — re-exporting them from this barrel would let a v2 rename
// silently change what a caller gets with no hint at the call site. Their only consumer is the
// blank-document factory, which lives inside v1/ (next to v1/index.js, which already exports
// them) precisely because a blank document must satisfy its own version's required fields.
