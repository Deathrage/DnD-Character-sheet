import type { z } from 'zod';
import { CURRENT, SCHEMAS, type CharacterDocument } from '../schema/index.js';
import { CharacterLoadError, toSchemaIssues, type LoadError } from './errors.js';
import { MIGRATIONS, type Migration } from './migrations.js';
import { versionOf } from './versionOf.js';

export type LoadResult =
  { ok: true; doc: CharacterDocument } | { ok: false; error: LoadError; raw: unknown };

/** The schema and migration tables the walk uses. A parameter so tests can supply a fake. */
export interface MigrationRegistry {
  current: number;
  schemas: Readonly<Record<number, z.ZodType>>;
  migrations: ReadonlyMap<number, Migration>;
}

export const defaultRegistry: MigrationRegistry = {
  current: CURRENT,
  schemas: SCHEMAS,
  migrations: MIGRATIONS,
};

function validateAt(registry: MigrationRegistry, version: number, doc: unknown): unknown {
  const schema = registry.schemas[version];
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
function runMigration(registry: MigrationRegistry, version: number, doc: unknown): unknown {
  const migration = registry.migrations.get(version);
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
function upgrade(raw: unknown, registry: MigrationRegistry): CharacterDocument {
  let doc: unknown = raw;

  for (let version = versionOf(raw, registry.current); version < registry.current; version++) {
    doc = validateAt(registry, version, doc);
    doc = runMigration(registry, version, doc);
  }

  return validateAt(registry, registry.current, doc) as CharacterDocument;
}

/**
 * Reads an untrusted value as a current-version character document,
 * migrating it forward if needed (spec §4). Never repairs or defaults.
 *
 * A failed LoadResult means the document is bad. A thrown error means this
 * loader is bad — those are rethrown rather than reported as data corruption.
 */
export function parseCharacter(
  raw: unknown,
  registry: MigrationRegistry = defaultRegistry,
): LoadResult {
  try {
    return { ok: true, doc: upgrade(raw, registry) };
  } catch (caught) {
    if (caught instanceof CharacterLoadError) {
      return { ok: false, error: caught.detail, raw };
    }
    throw caught;
  }
}
