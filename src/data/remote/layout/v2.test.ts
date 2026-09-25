import { describe, expect, it } from 'vitest';
import { ID_A } from '../../../test/fixtures.js';
import { parseCloudDocument } from './index.js';

const HASH = 'a'.repeat(64);
const AT = '2026-09-25T10:00:00.000Z';

// A plain Record shape, not the object literal TS would otherwise infer from `valid()`'s body:
// `ID_A` and `AT` are non-widened string consts, so an unannotated return type would carry their
// literal values as the only permitted keys, and the "damage" callbacks below deliberately swap
// in other keys to prove the schema — not this helper's inferred type — is what rejects them.
type Draft = {
  layoutVersion: 2;
  portraits: Record<string, Uint8Array>;
  characters: Record<string, Record<string, { sheet: Uint8Array; portrait: string }>>;
};
const valid = (): Draft => ({
  layoutVersion: 2,
  portraits: { [HASH]: new Uint8Array([1]) },
  characters: { [ID_A]: { [AT]: { sheet: new Uint8Array([2]), portrait: HASH } } },
});

describe('layout 2', () => {
  it('parses a valid document completely unaltered', () => {
    const raw = valid();
    expect(parseCloudDocument(raw)).toEqual({ ok: true, value: raw });
  });

  it('parses a player’s document that never had a portrait', () => {
    const raw = {
      layoutVersion: 2,
      characters: { [ID_A]: { [AT]: { sheet: new Uint8Array([2]), portrait: null } } },
    };
    expect(parseCloudDocument(raw)).toEqual({ ok: true, value: raw });
  });

  it('parses what deleting every version leaves', () => {
    expect(parseCloudDocument({ layoutVersion: 2, portraits: {}, characters: {} }).ok).toBe(true);
  });

  it.each<[string, (doc: ReturnType<typeof valid>) => void]>([
    ['the root', (doc) => Object.assign(doc, { extra: 1 })],
    ['a version', (doc) => Object.assign(doc.characters[ID_A]![AT]!, { extra: 1 })],
    [
      'a character id that is not a v4 uuid',
      (doc) => {
        doc.characters = { 'not-a-uuid': doc.characters[ID_A]! };
      },
    ],
    [
      'an upload time without milliseconds',
      (doc) => {
        doc.characters[ID_A] = { '2026-09-25T10:00:00Z': doc.characters[ID_A]![AT]! };
      },
    ],
    [
      'a portrait key that is not a SHA-256',
      (doc) => {
        doc.portraits = { nope: new Uint8Array([1]) };
      },
    ],
    [
      'a sheet that is not bytes',
      (doc) => {
        doc.characters[ID_A]![AT]!.sheet = 'gzip' as unknown as Uint8Array;
      },
    ],
  ])('rejects %s as INVALID_AT_VERSION', (_, damage) => {
    const raw = valid();
    damage(raw);
    expect(parseCloudDocument(raw)).toMatchObject({
      ok: false,
      error: { code: 'INVALID_AT_VERSION', version: 2 },
    });
  });

  it('reports a newer layout without reading it', () => {
    expect(parseCloudDocument({ layoutVersion: 3, anything: true })).toMatchObject({
      ok: false,
      error: { code: 'FROM_FUTURE', found: 3, current: 2 },
    });
  });

  it('reports a document with no layoutVersion as unversioned', () => {
    expect(parseCloudDocument({ characters: {} })).toMatchObject({
      ok: false,
      error: { code: 'UNVERSIONED' },
    });
  });
});
