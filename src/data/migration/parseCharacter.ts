import type { z } from 'zod';
import { CURRENT, SCHEMAS, type CharacterDocument } from '../schema/index.js';
import { CharacterLoadError, type LoadError, type SchemaIssue } from './errors.js';
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
    const issues: SchemaIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new CharacterLoadError({ code: 'INVALID_AT_VERSION', version, issues });
  }

  return result.data;
}

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
