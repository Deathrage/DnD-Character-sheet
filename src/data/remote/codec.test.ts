// src/data/remote/codec.test.ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ID_A, ID_B, docFor } from '../../test/fixtures.js';
import type { CharacterDocument } from '../schema/index.js';
import {
  bytesToPortrait,
  decodePayload,
  encodePayload,
  portraitHash,
  portraitToBytes,
} from './codec.js';

// A real exported character: 8 sessions of journal, so compression has something to do.
const zahir = (
  JSON.parse(
    readFileSync(
      new URL('../../../testAssets/zahir-ibn-talaar-2026-09-24.json', import.meta.url),
      'utf8',
    ),
  ) as { sheet: Parameters<typeof encodePayload>[0] }
).sheet;

// Smallest valid JPEG-shaped data URL the portrait rule accepts; the bytes need not be an image.
const PORTRAIT = `data:image/jpeg;base64,${btoa('\xff\xd8\xff\xe0 not really a jpeg \xff\xd9')}`;

describe('codec', () => {
  it('round-trips a real character, and compresses it', async () => {
    const payload = await encodePayload(zahir, null);
    expect(payload.sheet.byteLength).toBeLessThan(JSON.stringify(zahir).length / 2);

    const decoded = await decodePayload(payload, zahir.id);
    expect(decoded).toEqual({ ok: true, doc: zahir, portrait: null });
  });

  it('round-trips a portrait byte for byte', async () => {
    expect(bytesToPortrait(portraitToBytes(PORTRAIT))).toBe(PORTRAIT);
    const decoded = await decodePayload(await encodePayload(docFor(ID_A, 'Sable'), PORTRAIT), ID_A);
    expect(decoded.ok && decoded.portrait).toBe(PORTRAIT);
  });

  it('stores raw bytes, not base64: a third smaller', () => {
    expect(portraitToBytes(PORTRAIT).byteLength).toBe(atob(PORTRAIT.split(',')[1] ?? '').length);
  });

  it('assigns the id it is told to, so Keep both can restore as a copy', async () => {
    const decoded = await decodePayload(await encodePayload(docFor(ID_A, 'Sable'), null), ID_B);
    expect(decoded.ok && decoded.doc.id).toBe(ID_B);
  });

  it('reports bytes that are not gzip as corrupt', async () => {
    const decoded = await decodePayload({ sheet: new Uint8Array([1, 2, 3]), portrait: null }, ID_A);
    expect(decoded).toMatchObject({ ok: false, kind: 'corrupt' });
  });

  it('reports gzip that is not JSON as corrupt', async () => {
    const payload = await encodePayload(docFor(ID_A, 'Sable'), null);
    const notJson = new Uint8Array(
      await new Response(
        new Blob(['{ nope']).stream().pipeThrough(new CompressionStream('gzip')),
      ).arrayBuffer(),
    );
    expect(await decodePayload({ ...payload, sheet: notJson }, ID_A)).toMatchObject({
      ok: false,
      kind: 'corrupt',
    });
  });

  it('reports a document from a newer app as a load error, not as corrupt', async () => {
    // schemaVersion is a literal `1` on CharacterDocument, so a genuinely-future document (99)
    // is not representable in the type — the cast is the point, not a workaround for it.
    const future = { ...docFor(ID_A, 'Sable'), schemaVersion: 99 } as unknown as CharacterDocument;
    const decoded = await decodePayload(await encodePayload(future, null), ID_A);
    expect(decoded).toEqual({
      ok: false,
      kind: 'document',
      error: { code: 'FROM_FUTURE', found: 99, current: 1 },
    });
  });

  it('never repairs an invalid document', async () => {
    const padded = { ...docFor(ID_A, 'Sable'), name: ' Sable ' };
    const decoded = await decodePayload(await encodePayload(padded, null), ID_A);
    expect(decoded).toMatchObject({
      ok: false,
      kind: 'document',
      error: { code: 'INVALID_AT_VERSION' },
    });
  });

  it('keys a portrait by the lowercase hex SHA-256 of its bytes', async () => {
    // The published SHA-256 of "abc".
    expect(await portraitHash(new TextEncoder().encode('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });
});
