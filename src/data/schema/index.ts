import { z } from 'zod';
import { characterDocumentV1Schema } from './v1/index.js';
import { characterDocumentV2Schema, type CharacterDocumentV2 } from './v2/index.js';

/** The version this build writes. Bump when adding a schema version. */
export const CURRENT = 2;

/** Every historical schema, keyed by its version, for stepwise migration (spec §4). */
export const SCHEMAS: Readonly<Record<number, z.ZodType>> = {
  1: characterDocumentV1Schema,
  2: characterDocumentV2Schema,
};

/** The shape the business layer always sees. */
export type CharacterDocument = CharacterDocumentV2;

/**
 * The schema for `CURRENT`, named for the role rather than the version — the validating
 * counterpart to the `CharacterDocument` alias above. Anything validating a document the app
 * is about to write must use this, never a version-named schema.
 *
 * The annotation is what makes it version-tracking rather than merely version-neutral-looking:
 * because `.parse`/`.safeParse` accept `unknown`, a call site holding a `CharacterDocument`
 * would keep typechecking against `characterDocumentV1Schema` long after `CharacterDocument`
 * became V2 — and silently reject every save at the storage boundary instead. Declaring the
 * type here means the mismatch surfaces on this line, at the moment the alias is repointed.
 */
export const CURRENT_SCHEMA: z.ZodType<CharacterDocument> = characterDocumentV2Schema;

export { createCharacter, type CreateCharacterInput } from './v2/index.js';

// Deliberately not re-exported here: ABILITY_KEYS, SKILL_KEYS, SPELL_SLOT_LEVELS, and the
// version-named schemas and types (characterDocumentV2Schema, CharacterDocumentV2, and v1's).
// They are facts about one version, not version-neutral ones — re-exporting them from this barrel would let a v2 rename silently
// change what a caller gets with no hint at the call site.
//
// A version-named *schema* leaking through is the sharper form of that, because it also defeats
// the type system: `.parse()` takes `unknown`, so a consumer validating a `CharacterDocument`
// against `characterDocumentV1Schema` would still compile once `CharacterDocument` became V2,
// and would reject every current-version document at runtime instead. Consumers ask for
// CURRENT_SCHEMA (the current version) or SCHEMAS[n] (a specific historical version).
//
// Each version's consumers of its tuples and schema live inside its own directory and import
// them colocated from ./vN/document.js — including the blank-document factory, which lives in
// the current version's directory precisely because a blank document must satisfy its own
// version's required fields.
