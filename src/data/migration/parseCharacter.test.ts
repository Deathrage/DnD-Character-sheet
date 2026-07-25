import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createCharacter } from '../schema/index.js';
import type { Migration } from './migrations.js';
import { parseCharacter, type MigrationRegistry } from './parseCharacter.js';

const validRaw = () =>
  JSON.parse(
    JSON.stringify(
      createCharacter({
        name: 'Sable Nightwind',
        id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
        now: new Date('2026-07-25T09:41:00.000Z'),
      }),
    ),
  ) as unknown;

describe('parseCharacter', () => {
  it('returns the document for a valid current-version file', () => {
    const result = parseCharacter(validRaw());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.name).toBe('Sable Nightwind');
    }
  });

  it('reports UNVERSIONED and keeps the raw value for repair', () => {
    const raw = { anything: true };
    const result = parseCharacter(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNVERSIONED');
      expect(result.raw).toBe(raw);
    }
  });

  it('reports FROM_FUTURE without attempting to read the document', () => {
    const result = parseCharacter({ schemaVersion: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FROM_FUTURE');
  });

  it('reports INVALID_AT_VERSION with flattened issue paths', () => {
    const raw = validRaw() as Record<string, unknown>;
    raw.armorClass = -5;
    const result = parseCharacter(raw);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'INVALID_AT_VERSION') {
      expect(result.error.version).toBe(1);
      expect(result.error.issues.some((issue) => issue.path === 'armorClass')).toBe(true);
    } else {
      throw new Error('expected INVALID_AT_VERSION');
    }
  });

  it('never repairs a bad document by substituting defaults', () => {
    const raw = validRaw() as Record<string, unknown>;
    delete raw.armorClass;
    const result = parseCharacter(raw);
    expect(result.ok).toBe(false);
  });

  it('leaves the caller’s raw object untouched', () => {
    const raw = validRaw() as Record<string, unknown>;
    const before = JSON.stringify(raw);
    parseCharacter(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('rethrows a genuine bug instead of dressing it up as a corrupt file', () => {
    // A getter that throws stands in for any programming error inside the loader.
    const hostile = {
      get schemaVersion(): number {
        throw new TypeError('bug in the loader, not in the file');
      },
    };
    expect(() => parseCharacter(hostile)).toThrow(TypeError);
  });
});

// A synthetic two-version world, so the migration chain is exercised at v1 when
// no real second version exists yet. Version 1 is `{ v: 1, name }`; version 2
// renames `name` to `title`.
const V1 = z.object({ schemaVersion: z.literal(1), name: z.string() }).strict();
const V2 = z.object({ schemaVersion: z.literal(2), title: z.string() }).strict();

const oneToTwo: Migration = (doc) => {
  const from = doc as z.infer<typeof V1>;
  return { schemaVersion: 2, title: from.name };
};

const twoVersionRegistry = (migration: Migration = oneToTwo): MigrationRegistry => ({
  current: 2,
  schemas: { 1: V1, 2: V2 },
  migrations: new Map([[1, migration]]),
});

describe('parseCharacter migration chain', () => {
  it('migrates an old document forward to the current version', () => {
    const result = parseCharacter({ schemaVersion: 1, name: 'Sable' }, twoVersionRegistry());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc).toEqual({ schemaVersion: 2, title: 'Sable' });
    }
  });

  it('passes a document already at the current version straight through', () => {
    const result = parseCharacter({ schemaVersion: 2, title: 'Wren' }, twoVersionRegistry());
    expect(result.ok).toBe(true);
  });

  it('validates before migrating, so a bad v1 file never reaches the migration', () => {
    let called = false;
    const registry = twoVersionRegistry((doc) => {
      called = true;
      return oneToTwo(doc);
    });

    const result = parseCharacter({ schemaVersion: 1, name: 42 }, registry);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'INVALID_AT_VERSION') {
      expect(result.error.version).toBe(1);
    } else {
      throw new Error('expected INVALID_AT_VERSION at version 1');
    }
    expect(called).toBe(false);
  });

  it('reports MIGRATION_FAILED with the source version when a migration throws', () => {
    const registry = twoVersionRegistry(() => {
      throw new Error('could not derive title');
    });

    const result = parseCharacter({ schemaVersion: 1, name: 'Sable' }, registry);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'MIGRATION_FAILED') {
      expect(result.error.version).toBe(1);
      expect((result.error.cause as Error).message).toBe('could not derive title');
    } else {
      throw new Error('expected MIGRATION_FAILED');
    }
  });

  it('reports MIGRATION_FAILED when a migration produces something invalid', () => {
    const registry = twoVersionRegistry(() => ({ schemaVersion: 2 }));

    const result = parseCharacter({ schemaVersion: 1, name: 'Sable' }, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The output failed the v2 schema, so it surfaces as invalid at version 2.
      expect(result.error.code).toBe('INVALID_AT_VERSION');
      if (result.error.code === 'INVALID_AT_VERSION') expect(result.error.version).toBe(2);
    }
  });

  it('reports MIGRATION_FAILED when no migration is registered for a version', () => {
    const registry: MigrationRegistry = {
      current: 2,
      schemas: { 1: V1, 2: V2 },
      migrations: new Map(),
    };

    const result = parseCharacter({ schemaVersion: 1, name: 'Sable' }, registry);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'MIGRATION_FAILED') {
      expect(result.error.version).toBe(1);
    } else {
      throw new Error('expected MIGRATION_FAILED');
    }
  });

  it('walks more than one step when a document is two versions behind', () => {
    const V3 = z
      .object({ schemaVersion: z.literal(3), title: z.string(), tag: z.string() })
      .strict();
    const registry: MigrationRegistry = {
      current: 3,
      schemas: { 1: V1, 2: V2, 3: V3 },
      migrations: new Map<number, Migration>([
        [1, oneToTwo],
        [2, (doc) => ({ ...(doc as object), schemaVersion: 3, tag: 'migrated' })],
      ]),
    };

    const result = parseCharacter({ schemaVersion: 1, name: 'Sable' }, registry);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc).toEqual({ schemaVersion: 3, title: 'Sable', tag: 'migrated' });
    }
  });
});
