import { describeLoadError } from '../data/migration/errors.js';
import { exportFilename, toFileText } from '../data/serialization/exportCharacter.js';
import {
  fromFileText,
  fromJsonText,
  type ParseFileResult,
} from '../data/serialization/importCharacter.js';
import type { CharacterDocument } from '../data/schema/index.js';
import type { CharacterSheetBO } from './characterSheet.js';

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
const documents = new WeakMap<CharacterFile, Contents>();

interface Contents {
  doc: CharacterDocument;
  /** Beside the document, not in it — as in storage. */
  portrait: string | null;
}

function contentsOf(file: CharacterFile): Contents {
  const contents = documents.get(file);
  if (contents === undefined) {
    throw new Error('unreachable: every CharacterFile registers its document in its constructor');
  }
  return contents;
}

export function documentOf(file: CharacterFile): CharacterDocument {
  return contentsOf(file).doc;
}

/** Same module-private reach as `documentOf`, and not on `index.ts` either. */
export function portraitOf(file: CharacterFile): string | null {
  return contentsOf(file).portrait;
}

/** The sentence for text that would not read, whichever layer refused it. */
function describeFailure(failure: Exclude<ParseFileResult, { ok: true }>): string {
  switch (failure.kind) {
    case 'syntax':
      return `This file is not valid JSON. ${failure.message}`;
    case 'document':
      return describeLoadError(failure.error);
    case 'file':
      return `This is not a character file. ${failure.issues
        .map((issue) => (issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`))
        .join('; ')}`;
  }
}

/**
 * Parses a bare document — what the raw-JSON editor edits — under a chosen id, or into the
 * sentence explaining why not. `CharacterEntryBO.repair` passes the id of the row being
 * repaired, because a hand-edit of a damaged document is that same character, and a repair that
 * landed under a new id would leave the broken original in the list beside it.
 *
 * Deliberately not the `{ sheet, portrait }` envelope `CharacterFile.read` takes: the editor
 * never shows the portrait, so a pasted envelope's portrait would have nowhere honest to go.
 *
 * Not exported from `src/business/index.ts`: it deals in `CharacterDocument`.
 */
export function parseInto(
  text: string,
  id: string,
): { ok: true; doc: CharacterDocument } | { ok: false; message: string } {
  const parsed = fromJsonText(text, { assignId: id });
  if (parsed.ok) return { ok: true, doc: parsed.doc };
  return { ok: false, message: describeFailure(parsed) };
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

  private constructor(doc: CharacterDocument, portrait: string | null, filename: string) {
    this.#filename = filename;
    documents.set(this, { doc, portrait });
  }

  /**
   * Parses text into a file, or says why it could not, in one sentence a screen can print.
   *
   * A `{ ok }` union rather than spec §5's literal `CharacterFile | ParseFailure`. It is the same
   * information, and it matches how every other result in this codebase is already shaped —
   * `LoadResult`, `ListEntry`, `ParseTextResult` — so a caller discriminates the way it does
   * everywhere else instead of reaching for `instanceof`.
   *
   * Takes both shapes a file has had: the `{ sheet, portrait }` envelope, and a bare document,
   * which is every file exported before portraits existed.
   *
   * Every id is kept, the document's included — a departure from spec §9, which reassigned it.
   * Keeping it is what lets `library.add` recognise a character this browser already has and ask
   * Replace or Keep both, exactly as a cloud restore does; Keep both is where a new id is made.
   */
  static read(text: string): { ok: true; file: CharacterFile } | { ok: false; message: string } {
    const parsed = fromFileText(text);
    if (!parsed.ok) return { ok: false, message: describeFailure(parsed) };
    return {
      ok: true,
      file: new CharacterFile(
        parsed.doc,
        parsed.portrait,
        exportFilename(parsed.doc.name, new Date()),
      ),
    };
  }

  /** `now` is a parameter, not a default, so the dated filename is assertable. */
  static of(sheet: CharacterSheetBO, now: Date): CharacterFile {
    const doc = sheet.toDocument();
    return new CharacterFile(doc, sheet.portrait, exportFilename(doc.name, now));
  }

  get filename(): string {
    return this.#filename;
  }

  /** The `{ sheet, portrait }` envelope: the whole character, portrait included. */
  get text(): string {
    const { doc, portrait } = contentsOf(this);
    return toFileText(doc, portrait);
  }
}
