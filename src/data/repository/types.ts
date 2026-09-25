import type { LoadError } from '../migration/errors.js';
import type { LoadResult } from '../migration/parseCharacter.js';
import type { CharacterDocument } from '../schema/index.js';

export interface CharacterSummary {
  id: string;
  name: string;
  /** Derived while mapping. Never stored (spec §1). */
  totalLevel: number;
  /** Flattened in creation order for display. */
  classes: { name: string; level: number }[];
  /** The document's own `updatedAt`, which autosave stamps on every save. */
  updatedAt: string;
  /**
   * A data URL, or null. Read from the portraits store alongside the document, so the list can
   * show it without a second round trip per row.
   */
  portrait: string | null;
}

/**
 * A row of the character list. A document that will not load still appears,
 * flagged, so it can be repaired rather than vanishing (criterion 15).
 */
export type ListEntry =
  { ok: true; summary: CharacterSummary } | { ok: false; id: string; error: LoadError };

export interface CharacterRepository {
  list(): Promise<ListEntry[]>;
  /** null when no such id exists; a failed LoadResult when it exists but is damaged. */
  get(id: string): Promise<LoadResult | null>;
  /** The stored value with no validation, to seed the raw-JSON editor (spec §5). */
  getRaw(id: string): Promise<unknown>;
  /**
   * Validates before writing: an invalid document never reaches storage (spec §6).
   *
   * @throws {StorageError} with `detail.code === 'SAVE_REFUSED'` when the document does not
   * match the current schema. This is a rejection, not a load failure — it is thrown rather
   * than returned because, unlike a document read from storage, a document the app is trying
   * to write is one the app itself built, so a refusal here means either a bug in the caller or
   * an edit the raw-JSON editor should have caught. Callers that can produce an invalid document
   * (the raw-JSON editor, import) must catch it and surface `detail.issues`. Every other storage
   * failure (quota, an unavailable database) is also a `StorageError` — see `storageFailure.ts`.
   * Nothing Zod-typed escapes — see errors.ts.
   *
   * `portrait`, when given, is validated and written in the same transaction — import and clone,
   * which must not leave a character without the portrait it came with. Left out, the stored
   * portrait is untouched: autosave writes the document alone.
   */
  save(doc: CharacterDocument, portrait?: string | null): Promise<void>;
  /**
   * The stored portrait, or null when there is none. Not validated on the way out: it is only
   * ever shown as an `<img src>`, where a bad value is a broken image and nothing more.
   */
  getPortrait(id: string): Promise<string | null>;
  /**
   * Writes or, with `null`, removes a character's portrait. Validated like `save`: an invalid one
   * is refused with `SAVE_REFUSED` and never reaches storage.
   */
  savePortrait(id: string, portrait: string | null): Promise<void>;
  /** Removes the character and its portrait together, in one transaction. */
  delete(id: string): Promise<void>;
}
