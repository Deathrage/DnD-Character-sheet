import type { z } from 'zod';
import { CharacterLoadError, toSchemaIssues, type LoadError } from './errors.js';
import type { Migration } from './migrations.js';
import { versionOf } from './versionOf.js';

/**
 * A stored format versioned by one field: the character document (`schemaVersion`) and the cloud
 * layout (`layoutVersion`). The walk below is machinery, not a schema, so sharing it does not
 * breach the rule that versions share nothing (src/data/schema/README.md).
 */
export interface VersionedFormat {
  versionKey: string;
  current: number;
  schemas: Readonly<Record<number, z.ZodType>>;
  migrations: ReadonlyMap<number, Migration>;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: LoadError; raw: unknown };

function validateAt(format: VersionedFormat, version: number, doc: unknown): unknown {
  const schema = format.schemas[version];
  if (schema === undefined) {
    throw new CharacterLoadError({
      code: 'MIGRATION_FAILED',
      version,
      cause: `no schema registered for version ${version}`,
    });
  }

  const result = schema.safeParse(doc);
  if (!result.success) {
    const issues = toSchemaIssues(result.error);
    throw new CharacterLoadError({ code: 'INVALID_AT_VERSION', version, issues });
  }

  return result.data;
}

/**
 * The one deliberate exception to `parseCharacter`'s "a thrown error means the loader is bad"
 * rule below: a migration that throws is reported as `MIGRATION_FAILED` rather than rethrown.
 *
 * Every other throw inside this walk is a programming error, so letting it escape is right. A
 * migration is different — it can legitimately fail on input that is schema-valid but genuinely
 * unconvertible (a v1 field whose v2 counterpart has no defensible value for this particular
 * document, say), and that is a fact about the file, not a bug in the loader. Reporting it as
 * data corruption is what puts the document in front of the repair screen instead of crashing
 * the app. The original error is preserved verbatim as `cause`, so a migration that threw
 * because it really was buggy is still fully diagnosable.
 */
function runMigration(format: VersionedFormat, version: number, doc: unknown): unknown {
  const migration = format.migrations.get(version);
  if (migration === undefined) {
    throw new CharacterLoadError({
      code: 'MIGRATION_FAILED',
      version,
      cause: `no migration registered for version ${version}`,
    });
  }

  try {
    return migration(doc);
  } catch (cause) {
    throw new CharacterLoadError({ code: 'MIGRATION_FAILED', version, cause });
  }
}

/** Validates before every migration step, so each migration may assume a well-formed input. */
function upgrade(raw: unknown, format: VersionedFormat): unknown {
  let doc: unknown = raw;
  for (
    let version = versionOf(raw, format.current, format.versionKey);
    version < format.current;
    version++
  ) {
    doc = validateAt(format, version, doc);
    doc = runMigration(format, version, doc);
  }
  return validateAt(format, format.current, doc);
}

/**
 * Reads an untrusted value at its own version and migrates it to `format.current`. Never repairs
 * or defaults. A failed result means the value is bad; a thrown error means this loader is bad.
 */
export function parseVersioned<T>(raw: unknown, format: VersionedFormat): ParseResult<T> {
  try {
    return { ok: true, value: upgrade(raw, format) as T };
  } catch (caught) {
    if (caught instanceof CharacterLoadError) return { ok: false, error: caught.detail, raw };
    throw caught;
  }
}
