import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseVersioned, type VersionedFormat } from './versioned.js';

/** One version, keyed by whichever field the format names. */
const oneVersion = (versionKey: string): VersionedFormat => ({
  versionKey,
  current: 1,
  schemas: { 1: z.object({ [versionKey]: z.literal(1) }).strict() },
  migrations: new Map(),
});

describe('parseVersioned', () => {
  it('reads the version from the field its format names', () => {
    expect(parseVersioned({ layoutVersion: 1 }, oneVersion('layoutVersion'))).toEqual({
      ok: true,
      value: { layoutVersion: 1 },
    });
  });

  it("never reads another format's version field", () => {
    expect(parseVersioned({ schemaVersion: 1 }, oneVersion('layoutVersion'))).toMatchObject({
      ok: false,
      error: { code: 'UNVERSIONED' },
    });
    expect(parseVersioned({ layoutVersion: 1 }, oneVersion('schemaVersion'))).toMatchObject({
      ok: false,
      error: { code: 'UNVERSIONED' },
    });
  });

  it('migrates a format under its own key', () => {
    const format: VersionedFormat = {
      versionKey: 'layoutVersion',
      current: 2,
      schemas: {
        1: z.object({ layoutVersion: z.literal(1), a: z.string() }).strict(),
        2: z.object({ layoutVersion: z.literal(2), b: z.string() }).strict(),
      },
      migrations: new Map([[1, (doc) => ({ layoutVersion: 2, b: (doc as { a: string }).a })]]),
    };
    expect(parseVersioned({ layoutVersion: 1, a: 'x' }, format)).toEqual({
      ok: true,
      value: { layoutVersion: 2, b: 'x' },
    });
  });
});
