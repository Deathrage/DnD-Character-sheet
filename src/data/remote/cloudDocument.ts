import { CURRENT_LAYOUT, type CloudDocument } from './layout/index.js';
import { documentSize } from './size.js';

/**
 * An upload's data. The portrait is keyed by its SHA-256 (`portraitHash`), so an image shared
 * by several versions is stored once.
 */
export interface NewVersion {
  sheet: Uint8Array;
  portrait: { hash: string; bytes: Uint8Array } | null;
}

export const cloudDocumentPath = (uid: string): [string, string] => ['cloud', uid];

export const cloudDocumentSize = (uid: string, doc: CloudDocument): number =>
  documentSize(cloudDocumentPath(uid), doc);

/**
 * The document after an upload, exactly as Firestore's `setDoc(..., { merge: true })` in
 * `cloudStore.ts` leaves it. That includes never writing an empty `portraits`: merging `{}`
 * wipes the stored map. Shared by the store's test fake and by the quota message, so the three
 * cannot disagree.
 */
export function withVersion(
  doc: CloudDocument | null,
  characterId: string,
  uploadedAt: string,
  version: NewVersion,
): CloudDocument {
  const base: CloudDocument = doc ?? { layoutVersion: CURRENT_LAYOUT, characters: {} };
  const { portrait } = version;
  return {
    ...base,
    // Copied into a fresh Uint8Array: `NewVersion`'s bytes come from outside this module (typed
    // as plain `Uint8Array`, per codec.ts), while a parsed/stored `CloudDocument`'s bytes are the
    // narrower `Uint8Array<ArrayBuffer>` zod infers for `z.instanceof(Uint8Array)`.
    ...(portrait === null
      ? {}
      : { portraits: { ...base.portraits, [portrait.hash]: new Uint8Array(portrait.bytes) } }),
    characters: {
      ...base.characters,
      [characterId]: {
        ...base.characters[characterId],
        [uploadedAt]: {
          sheet: new Uint8Array(version.sheet),
          portrait: version.portrait?.hash ?? null,
        },
      },
    },
  };
}

/**
 * The document after deleting some versions of one character (`null`: all of them), and the field
 * paths the store deletes to get there.
 *
 * - A character left with no versions is removed whole, never left as an empty map.
 * - A portrait no remaining version references is removed too.
 *
 * Decided from `doc` alone. That is why the store calls it inside a transaction, on a document it
 * has just read.
 */
export function withoutVersions(
  doc: CloudDocument,
  characterId: string,
  uploadedAts: readonly string[] | null,
): { doc: CloudDocument; removed: string[][] } {
  const versions = doc.characters[characterId] ?? {};
  const doomed = Object.keys(versions).filter(
    (uploadedAt) => uploadedAts === null || uploadedAts.includes(uploadedAt),
  );
  if (doomed.length === 0) return { doc, removed: [] };

  const kept = Object.fromEntries(
    Object.entries(versions).filter(([uploadedAt]) => !doomed.includes(uploadedAt)),
  );
  const removed: string[][] = [];
  const characters = Object.fromEntries(
    Object.entries(doc.characters).filter(([id]) => id !== characterId),
  );
  if (Object.keys(kept).length === 0) {
    removed.push(['characters', characterId]);
  } else {
    characters[characterId] = kept;
    for (const uploadedAt of doomed) removed.push(['characters', characterId, uploadedAt]);
  }

  const used = new Set(
    Object.values(characters).flatMap((vs) => Object.values(vs).map((v) => v.portrait)),
  );
  if (doc.portraits === undefined) return { doc: { ...doc, characters }, removed };
  const portraits = Object.fromEntries(
    Object.entries(doc.portraits).filter(([hash]) => used.has(hash)),
  );
  for (const hash of Object.keys(doc.portraits)) {
    if (!used.has(hash)) removed.push(['portraits', hash]);
  }
  return { doc: { ...doc, characters, portraits }, removed };
}
