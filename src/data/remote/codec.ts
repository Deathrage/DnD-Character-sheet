import type { LoadError } from '../migration/errors.js';
import { parseCharacter } from '../migration/parseCharacter.js';
import { portraitSchema } from '../repository/portrait.js';
import type { CharacterDocument } from '../schema/index.js';

/**
 * A version's data as Firestore stores it, minus the `Bytes` wrapper — which is Firebase's, and
 * so is added and removed only in `firestoreRepository.ts`. Plain bytes keep this file free of
 * `firebase` and testable under Node.
 */
export interface Payload {
  /** `JSON.stringify(doc)`, gzipped. */
  sheet: Uint8Array;
  /** The JPEG itself, decoded from its data URL: a third smaller than the base64. */
  portrait: Uint8Array | null;
}

export type DecodeResult =
  | { ok: true; doc: CharacterDocument; portrait: string | null }
  /** The bytes are not gzip, the gzip is not JSON, or the portrait is not a JPEG. */
  | { ok: false; kind: 'corrupt'; message: string }
  /** Readable JSON that `parseCharacter` refused: the same taxonomy as a stored document. */
  | { ok: false; kind: 'document'; error: LoadError };

const JPEG_PREFIX = 'data:image/jpeg;base64,';

async function drain(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export function portraitToBytes(dataUrl: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(dataUrl.slice(JPEG_PREFIX.length)), (char) => char.charCodeAt(0));
}

/** A loop, not `String.fromCharCode(...bytes)`: spreading ~17 000 arguments is an engine limit. */
export function bytesToPortrait(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return JPEG_PREFIX + btoa(binary);
}

/** The browser's own `CompressionStream` — no dependency. Node 24 has it too, so this is tested. */
export async function encodePayload(
  doc: CharacterDocument,
  portrait: string | null,
): Promise<Payload> {
  const sheet = await drain(
    new Blob([JSON.stringify(doc)]).stream().pipeThrough(new CompressionStream('gzip')),
  );
  return { sheet, portrait: portrait === null ? null : portraitToBytes(portrait) };
}

/**
 * The cloud copy's way back in, through the same `parseCharacter` a stored document takes: it is
 * validated and migrated, and one that will not load is reported, never repaired (the one
 * promise). `assignId` is the id the restored character takes — its own, or a fresh one for
 * "Keep both".
 */
export async function decodePayload(payload: Payload, assignId: string): Promise<DecodeResult> {
  let raw: unknown;
  try {
    // Copied so the Blob gets an ArrayBuffer-backed view, whatever buffer Firestore handed back.
    const text = await new Response(
      new Blob([new Uint8Array(payload.sheet)])
        .stream()
        .pipeThrough(new DecompressionStream('gzip')),
    ).text();
    raw = JSON.parse(text);
  } catch (caught) {
    return {
      ok: false,
      kind: 'corrupt',
      message: caught instanceof Error ? caught.message : String(caught),
    };
  }

  const parsed = parseCharacter(raw);
  if (!parsed.ok) return { ok: false, kind: 'document', error: parsed.error };

  const portrait = payload.portrait === null ? null : bytesToPortrait(payload.portrait);
  if (portrait !== null && !portraitSchema.safeParse(portrait).success) {
    return { ok: false, kind: 'corrupt', message: 'Its portrait is not a valid JPEG.' };
  }
  return { ok: true, doc: { ...parsed.doc, id: assignId }, portrait };
}

/** Lowercase hex SHA-256 of a portrait's bytes: its key in the cloud document (spec §2). */
export async function portraitHash(bytes: Uint8Array): Promise<string> {
  // Copied: `digest` wants an ArrayBuffer-backed view, whatever buffer `bytes` sits on.
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
