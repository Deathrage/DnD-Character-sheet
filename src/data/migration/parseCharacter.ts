import type { z } from 'zod';
import { CURRENT, SCHEMAS, type CharacterDocument } from '../schema/index.js';
import type { LoadError } from './errors.js';
import { MIGRATIONS, type Migration } from './migrations.js';
import { parseVersioned } from './versioned.js';

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

/**
 * Reads an untrusted value as a current-version character document,
 * migrating it forward if needed (spec §4). Never repairs or defaults.
 *
 * A failed LoadResult means the document is bad. A thrown error means this
 * loader is bad — those are rethrown rather than reported as data corruption.
 *
 * The walk itself is `parseVersioned`, shared with the cloud layout.
 */
export function parseCharacter(
  raw: unknown,
  registry: MigrationRegistry = defaultRegistry,
): LoadResult {
  const parsed = parseVersioned<CharacterDocument>(raw, {
    versionKey: 'schemaVersion',
    ...registry,
  });
  return parsed.ok ? { ok: true, doc: parsed.value } : parsed;
}
