import { z } from 'zod';
import { characterDocumentV1Schema, type CharacterDocumentV1 } from './v1/index.js';

/** The version this build writes. Bump when adding a schema version. */
export const CURRENT = 1;

/** Every historical schema, keyed by its version, for stepwise migration (spec §4). */
export const SCHEMAS: Readonly<Record<number, z.ZodType>> = {
  1: characterDocumentV1Schema,
};

/** The shape the business layer always sees. */
export type CharacterDocument = CharacterDocumentV1;

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
export const CURRENT_SCHEMA: z.ZodType<CharacterDocument> = characterDocumentV1Schema;

export { createCharacter, type CreateCharacterInput } from './v1/index.js';

// Deliberately not re-exported here: ABILITY_KEYS, SKILL_KEYS, SPELL_SLOT_LEVELS, and the
// version-named characterDocumentV1Schema / CharacterDocumentV1 themselves. They are v1 facts,
// not version-neutral ones — re-exporting them from this barrel would let a v2 rename silently
// change what a caller gets with no hint at the call site.
//
// A version-named *schema* leaking through is the sharper form of that, because it also defeats
// the type system: `.parse()` takes `unknown`, so a consumer validating a `CharacterDocument`
// against `characterDocumentV1Schema` would still compile once `CharacterDocument` became V2,
// and would reject every current-version document at runtime instead. Consumers ask for
// CURRENT_SCHEMA (the current version) or SCHEMAS[n] (a specific historical version).
//
// The v1 consumers of the tuples and the v1 schema live inside v1/ and import them colocated
// from ./v1/document.js — including the blank-document factory, which is in v1/ precisely
// because a blank document must satisfy its own version's required fields.
