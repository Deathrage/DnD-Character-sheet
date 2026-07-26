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
  hitPoints: { current: number; total: number; temporary: number };
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
   * @throws {CharacterLoadError} with `detail.code === 'INVALID_AT_VERSION'` when the document
   * does not match the current schema. This is a rejection, not a load failure — it is thrown
   * rather than returned because, unlike a document read from storage, a document the app is
   * trying to write is one the app itself built, so a refusal here means either a bug in the
   * caller or an edit the raw-JSON editor should have caught. Callers that can produce an
   * invalid document (the raw-JSON editor, import) must catch it and surface `detail.issues`;
   * `describeLoadError(detail)` renders it. Nothing Zod-typed escapes — see errors.ts.
   */
  save(doc: CharacterDocument): Promise<void>;
  delete(id: string): Promise<void>;
}
