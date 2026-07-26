import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createCharacter } from '../schema/index.js';
import type { Migration } from './migrations.js';
import { parseCharacter, type MigrationRegistry } from './parseCharacter.js';

const validRaw = () => {
  const doc = createCharacter({
    name: 'Sable Nightwind',
    id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
    now: new Date('2026-07-25T09:41:00.000Z'),
  });
  // A blank document is almost entirely empty strings and zeroes, against which most silent
  // rewrites are no-ops. Populating the fields that permit padding — longText does, only names
  // reject it — is what gives the `toEqual(raw)` assertion below something to lose.
  doc.journalAndNotes = { journal: ['  Arrived in Barovia.  '], notes: '  Find the Sunsword.\n' };
  doc.inventory.items = [{ name: "Thieves' Tools", description: '  For locks.  ', count: 1 }];
  return JSON.parse(JSON.stringify(doc)) as unknown;
};

describe('parseCharacter', () => {
  it('returns a valid current-version file completely unaltered', () => {
    // toEqual against the captured raw input, not a single field. parseCharacter returns Zod's
    // result.data, so a `.default()`, `.catch()` or `.transform()` added to any primitive later
    // would silently rewrite a VALID stored document on load — the one silent-repair route no
    // other test in this file covers, because every other case here is about INVALID input.
    const raw = validRaw();
    const result = parseCharacter(raw);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.name).toBe('Sable Nightwind');
      expect(result.doc).toEqual(raw);
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
    const raw = { schemaVersion: 2, title: 'Wren' };
    const result = parseCharacter(raw, twoVersionRegistry());
    expect(result.ok).toBe(true);
    // The zero-migration path has no other test, and `ok === true` alone would not notice the
    // walk quietly running a migration it should have skipped, or altering the document.
    if (result.ok) expect(result.doc).toEqual(raw);
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

  it('keeps the ORIGINAL input as raw when a failure happens mid-migration', () => {
    // The repair screen shows `raw` and lets the user hand-edit it. On a multi-step walk the
    // loader is holding a partially-migrated intermediate by the time it fails, and handing
    // that back would put a document in front of the user that they never wrote and that does
    // not exist in storage — edits to it would not correspond to the stored file. Only the
    // single-step UNVERSIONED path pinned this before; nothing covered the migration path.
    const V3 = z.object({ schemaVersion: z.literal(3), title: z.string() }).strict();
    const registry: MigrationRegistry = {
      current: 3,
      schemas: { 1: V1, 2: V2, 3: V3 },
      migrations: new Map<number, Migration>([
        [1, oneToTwo], // succeeds: { schemaVersion: 1, name } -> { schemaVersion: 2, title }
        [
          2,
          () => {
            throw new Error('2 -> 3 cannot convert this document');
          },
        ],
      ]),
    };

    const original = { schemaVersion: 1, name: 'Sable' };
    const result = parseCharacter(original, registry);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('MIGRATION_FAILED');
      // The same object identity the caller passed in — not the { schemaVersion: 2, title }
      // intermediate the 1->2 step produced, and not a copy of it.
      expect(result.raw).toBe(original);
      expect(result.raw).toEqual({ schemaVersion: 1, name: 'Sable' });
    }
  });

  it('reports INVALID_AT_VERSION at the target version when a migration produces something invalid', () => {
    const registry = twoVersionRegistry(() => ({ schemaVersion: 2 }));

    const result = parseCharacter({ schemaVersion: 1, name: 'Sable' }, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Named for what it asserts. A migration that RUNS but yields a document failing the
      // next version's schema is not MIGRATION_FAILED — the migration itself did not fail, its
      // output did, so it surfaces as invalid at version 2. Distinguishing the two codes is
      // this file's whole purpose, so the name must not claim the other one.
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
      // Pinning the cause string, not just the code, is what distinguishes this branch
      // (no migration registered) from the sibling "no schema registered" branch below —
      // both report MIGRATION_FAILED, and a version number alone would not tell them apart
      // if a bug ever made the wrong one fire.
      expect(result.error.cause).toBe('no migration registered for version 1');
    } else {
      throw new Error('expected MIGRATION_FAILED');
    }
  });

  it('reports MIGRATION_FAILED naming the version whose schema is missing, not the source or current version', () => {
    // A gap at version 2: schemas exist for 1 and 3, migrations exist for 1 and 2. The walk
    // validates at 1 (ok), migrates 1→2 (ok), then must validate the result at 2 before
    // running the 2→3 migration — and there is no schema registered for 2.
    const V3 = z.object({ schemaVersion: z.literal(3), title: z.string() }).strict();
    const registry: MigrationRegistry = {
      current: 3,
      schemas: { 1: V1, 3: V3 },
      migrations: new Map<number, Migration>([
        [1, oneToTwo],
        [2, (doc) => ({ ...(doc as object), schemaVersion: 3 })],
      ]),
    };

    const result = parseCharacter({ schemaVersion: 1, name: 'Sable' }, registry);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'MIGRATION_FAILED') {
      // 2, not 1 (the source version) and not 3 (current) — an off-by-one here would send
      // a repair screen pointing at the wrong version.
      expect(result.error.version).toBe(2);
      expect(result.error.cause).toBe('no schema registered for version 2');
    } else {
      throw new Error('expected MIGRATION_FAILED at version 2');
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
