import {
  Bytes,
  deleteField,
  doc,
  FieldPath,
  getDoc,
  runTransaction,
  setDoc,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore/lite';
import { cloudDocumentPath, withoutVersions, type NewVersion } from './cloudDocument.js';
import { CURRENT_LAYOUT, parseCloudDocument } from './layout/index.js';
import type { CloudLoad } from './types.js';

/** Firestore hands back `Bytes`. The layout speaks `Uint8Array`, so it is tested without the SDK. */
function fromFirestore(value: unknown): unknown {
  if (value instanceof Bytes) return value.toUint8Array();
  if (Array.isArray(value)) return value.map(fromFirestore);
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, fromFirestore(v)]));
  }
  return value;
}

function toLoad(snapshot: DocumentSnapshot): CloudLoad {
  if (!snapshot.exists()) return { ok: true, doc: null };
  const parsed = parseCloudDocument(fromFirestore(snapshot.data()));
  return parsed.ok ? { ok: true, doc: parsed.value } : { ok: false, error: parsed.error };
}

export type CloudStore = ReturnType<typeof createCloudStore>;

/** The player's one cloud document (cloud-quota spec §2, §4). `uid` is read per call. */
export function createCloudStore(db: Firestore, uid: () => string) {
  const ref = () => doc(db, ...cloudDocumentPath(uid()));

  return {
    load: async (): Promise<CloudLoad> => toLoad(await getDoc(ref())),

    upload: (characterId: string, uploadedAt: string, version: NewVersion): Promise<void> =>
      setDoc(
        ref(),
        {
          layoutVersion: CURRENT_LAYOUT,
          // Absent, never `{}`: merging an empty map replaces the stored one (spec §4).
          ...(version.portrait === null
            ? {}
            : {
                portraits: {
                  [version.portrait.hash]: Bytes.fromUint8Array(version.portrait.bytes),
                },
              }),
          characters: {
            [characterId]: {
              [uploadedAt]: {
                sheet: Bytes.fromUint8Array(version.sheet),
                portrait: version.portrait?.hash ?? null,
              },
            },
          },
        },
        // Adds these keys and leaves every other: two devices uploading at once both land.
        { merge: true },
      ),

    deleteVersions: (
      characterId: string,
      uploadedAts: readonly string[] | null,
    ): Promise<CloudLoad> =>
      // A transaction, so a portrait another device starts using mid-delete is not removed:
      // the commit fails on the changed document and this runs again on the new one.
      runTransaction(db, async (transaction) => {
        const loaded = toLoad(await transaction.get(ref()));
        // Unreadable or newer: nothing is written to a document this build cannot read.
        if (!loaded.ok || loaded.doc === null) return loaded;
        const { doc: after, removed } = withoutVersions(loaded.doc, characterId, uploadedAts);
        const [first, ...rest] = removed.map((path) => new FieldPath(...path));
        if (first !== undefined) {
          transaction.update(
            ref(),
            first,
            deleteField(),
            ...rest.flatMap((path) => [path, deleteField()]),
          );
        }
        return { ok: true, doc: after };
      }),
  };
}
