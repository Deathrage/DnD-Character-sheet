import { describe, expect, it } from 'vitest';
import { ID_A, ID_B } from '../../test/fixtures.js';
import {
  cloudDocumentSize,
  withoutVersions,
  withVersion,
  type NewVersion,
} from './cloudDocument.js';
import { parseCloudDocument, type CloudDocument } from './layout/index.js';

const H1 = '1'.repeat(64);
const H2 = '2'.repeat(64);
const T1 = '2026-09-25T10:00:00.000Z';
const T2 = '2026-09-25T11:00:00.000Z';
const sheet = (n: number) => new Uint8Array(n).fill(7);
const plain = (n: number): NewVersion => ({ sheet: sheet(n), portrait: null });
const pictured = (n: number, hash: string): NewVersion => ({
  sheet: sheet(n),
  portrait: { hash, bytes: new Uint8Array([9, 9]) },
});

describe('withVersion', () => {
  it('creates the document on a first upload, with no portraits field when there is no portrait', () => {
    const doc = withVersion(null, ID_A, T1, plain(3));
    expect(doc).toEqual({
      layoutVersion: 2,
      characters: { [ID_A]: { [T1]: { sheet: sheet(3), portrait: null } } },
    });
    expect(parseCloudDocument(doc).ok).toBe(true);
  });

  it('stores one portrait once, however many versions use it', () => {
    const once = withVersion(null, ID_A, T1, pictured(3, H1));
    const twice = withVersion(once, ID_A, T2, pictured(3, H1));
    expect(Object.keys(twice.portraits ?? {})).toEqual([H1]);
    // The second version's own entry is the whole growth: key T2 (24 + 1), then `sheet` (6) + 3
    // bytes, then `portrait` (9) + the hash as a string (64 + 1). The portrait itself is not
    // stored again.
    expect(cloudDocumentSize('u1', twice) - cloudDocumentSize('u1', once)).toBe(
      25 + (6 + 3) + (9 + 65),
    );
  });

  it('keeps every other character and version', () => {
    const doc = withVersion(withVersion(null, ID_A, T1, plain(1)), ID_B, T2, plain(2));
    expect(Object.keys(doc.characters)).toEqual([ID_A, ID_B]);
    expect(withVersion(doc, ID_A, T2, plain(3)).characters[ID_A]).toHaveProperty(T1);
  });

  it('never changes the document it is given', () => {
    const doc = withVersion(null, ID_A, T1, plain(1));
    const before = structuredClone(doc);
    withVersion(doc, ID_A, T2, pictured(2, H1));
    expect(doc).toEqual(before);
  });
});

describe('withoutVersions', () => {
  const two = (): CloudDocument =>
    withVersion(withVersion(null, ID_A, T1, pictured(1, H1)), ID_A, T2, pictured(1, H2));

  it('removes one version by its own path and keeps the other', () => {
    const { doc, removed } = withoutVersions(two(), ID_A, [T1]);
    expect(Object.keys(doc.characters[ID_A]!)).toEqual([T2]);
    expect(removed).toContainEqual(['characters', ID_A, T1]);
  });

  it('removes the character itself with its last version, never leaving an empty map', () => {
    const { doc, removed } = withoutVersions(withVersion(null, ID_A, T1, plain(1)), ID_A, [T1]);
    expect(doc.characters).toEqual({});
    expect(removed).toEqual([['characters', ID_A]]);
    expect(parseCloudDocument(doc).ok).toBe(true);
  });

  it('removes a portrait no remaining version uses, and keeps one still in use', () => {
    const shared = withVersion(
      withVersion(null, ID_A, T1, pictured(1, H1)),
      ID_B,
      T1,
      pictured(1, H1),
    );
    expect(withoutVersions(shared, ID_A, null).doc.portraits).toEqual({
      [H1]: new Uint8Array([9, 9]),
    });

    const { doc, removed } = withoutVersions(two(), ID_A, [T1]);
    expect(Object.keys(doc.portraits ?? {})).toEqual([H2]);
    expect(removed).toContainEqual(['portraits', H1]);
  });

  it('removes every version when given null', () => {
    const { doc, removed } = withoutVersions(two(), ID_A, null);
    expect(doc.characters).toEqual({});
    expect(doc.portraits).toEqual({});
    expect(removed).toEqual(
      expect.arrayContaining([
        ['characters', ID_A],
        ['portraits', H1],
        ['portraits', H2],
      ]),
    );
  });

  it('is a no-op for a version that is already gone', () => {
    const doc = two();
    expect(withoutVersions(doc, ID_A, ['2026-01-01T00:00:00.000Z'])).toEqual({ doc, removed: [] });
    expect(withoutVersions(doc, ID_B, null)).toEqual({ doc, removed: [] });
  });

  it('never changes the document it is given', () => {
    const doc = two();
    const before = structuredClone(doc);
    withoutVersions(doc, ID_A, null);
    expect(doc).toEqual(before);
  });
});
