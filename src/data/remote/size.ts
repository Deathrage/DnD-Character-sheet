/**
 * A document's storage size by Firestore's published rules
 * (firebase.google.com/docs/firestore/storage-size), checked against the emulator by
 * binary-searching the largest document it accepts (cloud-quota spec §3). Only ever a display:
 * Firestore enforces the limit, and `cloudStore.emulator.test.ts` checks they agree.
 */
export const MAX_DOCUMENT_BYTES = 1_048_576;

const utf8 = new TextEncoder();

export const stringSize = (value: string): number => utf8.encode(value).byteLength + 1;

const sum = (sizes: number[]): number => sizes.reduce((total, size) => total + size, 0);

export function valueSize(value: unknown): number {
  if (value === null || typeof value === 'boolean') return 1;
  if (typeof value === 'number') return 8;
  if (typeof value === 'string') return stringSize(value);
  if (value instanceof Uint8Array) return value.byteLength;
  // Empty containers: the published table says 0, the emulator measures 1. Counting 1 errs, by
  // one byte, towards "too big".
  if (Array.isArray(value)) return value.length === 0 ? 1 : sum(value.map(valueSize));
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    return entries.length === 0
      ? 1
      : sum(entries.map(([key, v]) => stringSize(key) + valueSize(v)));
  }
  throw new TypeError(`Firestore has no size for a ${typeof value}`);
}

/** `path` alternates collection and document ids, e.g. `['cloud', uid]`. */
export function documentSize(
  path: readonly string[],
  fields: Readonly<Record<string, unknown>>,
): number {
  const name = sum(path.map(stringSize)) + 16;
  const body = sum(Object.entries(fields).map(([key, v]) => stringSize(key) + valueSize(v)));
  return name + body + 32;
}
