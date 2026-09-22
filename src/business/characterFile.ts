import { describeLoadError } from '../data/migration/errors.js';
import { exportFilename, toJsonText } from '../data/serialization/exportCharacter.js';
import { fromJsonText } from '../data/serialization/importCharacter.js';
import type { CharacterDocument } from '../data/schema/index.js';
import type { CharacterSheetBO } from './characterSheet.js';
import { createId } from './createId.js';

/**
 * The document behind each file, held module-privately rather than in a field or behind a static
 * accessor.
 *
 * `CharacterFile` is exported from `src/business/index.ts`, so anything on the class — including
 * a static method "for internal use" — is reachable from `src/ui/`. That is the same mistake
 * `categorized.ts` made with its `rawItems` getter and fixed the same way: a member with no
 * access modifier is internal to nobody. `documentOf` is a module function this barrel does not
 * re-export, so `characterLibrary.ts` can reach the document and a component cannot.
 */
const documents = new WeakMap<CharacterFile, CharacterDocument>();

export function documentOf(file: CharacterFile): CharacterDocument {
  const doc = documents.get(file);
  if (doc === undefined) {
    throw new Error('unreachable: every CharacterFile registers its document in its constructor');
  }
  return doc;
}

/**
 * Parses text into a document under a chosen id, or into the sentence explaining why not.
 *
 * Two callers with opposite needs for that id, which is the whole reason it is a parameter:
 * `CharacterFile.read` mints a fresh one, because importing a character must not overwrite the
 * one it was exported from. `CharacterEntryBO.repair` passes the id of the row being repaired,
 * because a hand-edit of a damaged document is that same character, and a repair that landed
 * under a new id would leave the broken original in the list beside it.
 *
 * Not exported from `src/business/index.ts`: it deals in `CharacterDocument`.
 */
export function parseInto(
  text: string,
  id: string,
): { ok: true; doc: CharacterDocument } | { ok: false; message: string } {
  const parsed = fromJsonText(text, { assignId: id });
  if (parsed.ok) return { ok: true, doc: parsed.doc };
  return {
    ok: false,
    message:
      parsed.kind === 'syntax'
        ? `This file is not valid JSON. ${parsed.message}`
        : describeLoadError(parsed.error),
  };
}

/**
 * A character as a file: the opaque token the UI carries from "the player picked a file" to
 * `library.add(file)`, and from "the player tapped Export" to a download.
 *
 * It is opaque on purpose. This is why `CharacterDocument` never appears in a signature the UI
 * can see — the document's shape belongs to the data layer, and a UI that could name it would be
 * free to build one.
 */
export class CharacterFile {
  readonly #filename: string;

  private constructor(doc: CharacterDocument, filename: string) {
    this.#filename = filename;
    documents.set(this, doc);
  }

  /**
   * Parses text into a file, or says why it could not, in one sentence a screen can print.
   *
   * A `{ ok }` union rather than spec §5's literal `CharacterFile | ParseFailure`. It is the same
   * information, and it matches how every other result in this codebase is already shaped —
   * `LoadResult`, `ListEntry`, `ParseTextResult` — so a caller discriminates the way it does
   * everywhere else instead of reaching for `instanceof`.
   *
   * The document id is reassigned and the item ids are not (spec §9): item ids are scoped within
   * their document, so a collision across two characters is meaningless, while two characters
   * sharing a document id would collide in the one place it matters, the store key.
   */
  static read(text: string): { ok: true; file: CharacterFile } | { ok: false; message: string } {
    const parsed = parseInto(text, createId());
    if (!parsed.ok) return parsed;
    return {
      ok: true,
      file: new CharacterFile(parsed.doc, exportFilename(parsed.doc.name, new Date())),
    };
  }

  /** `now` is a parameter, not a default, so the dated filename is assertable. */
  static of(sheet: CharacterSheetBO, now: Date): CharacterFile {
    const doc = sheet.toDocument();
    return new CharacterFile(doc, exportFilename(doc.name, now));
  }

  get filename(): string {
    return this.#filename;
  }

  get text(): string {
    return toJsonText(documentOf(this));
  }
}
