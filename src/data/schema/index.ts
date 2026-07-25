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
export { ABILITY_KEYS, SKILL_KEYS, SPELL_SLOT_LEVELS } from './v1/index.js';
