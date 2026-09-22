import { describe, expect, it } from 'vitest';
import { CharacterFile, documentOf } from './characterFile.js';
import { createCharacterSheet } from './characterSheet.js';

const CREATED_AT = new Date('2026-07-25T09:41:00.000Z');
const EXPORTED_AT = new Date('2026-09-22T17:00:00.000Z');

const filled = () => {
  const sheet = createCharacterSheet('Sable Nightwind', CREATED_AT);
  sheet.classes.add({ name: 'Rogue', level: 5 });
  sheet.featsAndTraits.add({ name: 'Darkvision', description: '60 ft' });
  return sheet;
};

describe('CharacterFile.of', () => {
  it('names the file from the character and the date', () => {
    expect(CharacterFile.of(filled(), EXPORTED_AT).filename).toBe(
      'sable-nightwind-2026-09-22.json',
    );
  });

  it('writes the document as pretty-printed JSON ending in a newline', () => {
    const text = CharacterFile.of(filled(), EXPORTED_AT).text;
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "name": "Sable Nightwind",');
  });
});

describe('CharacterFile.read', () => {
  it('round-trips an exported character', () => {
    const sheet = filled();
    const result = CharacterFile.read(CharacterFile.of(sheet, EXPORTED_AT).text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const imported = documentOf(result.file);
    const original = sheet.toDocument();
    expect(imported).toEqual({ ...original, id: imported.id });
  });

  it('reassigns the document id and keeps every item id', () => {
    const sheet = filled();
    const original = sheet.toDocument();
    const result = CharacterFile.read(CharacterFile.of(sheet, EXPORTED_AT).text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const imported = documentOf(result.file);
    // A document id is the store key, so two characters sharing one would collide.
    expect(imported.id).not.toBe(original.id);
    // Item ids are scoped within their document, so a collision across two is meaningless —
    // and keeping them is what makes a re-import recognisable as the same character (spec §9).
    expect(imported.classes[0]?.id).toBe(original.classes[0]?.id);
    expect(imported.featsAndTraits.uncategorized[0]?.id).toBe(
      original.featsAndTraits.uncategorized[0]?.id,
    );
  });

  it('explains text that is not JSON', () => {
    const result = CharacterFile.read('{ not json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/not valid JSON/);
  });

  it('explains JSON that is not a character, in the load error own words', () => {
    const result = CharacterFile.read(JSON.stringify({ schemaVersion: 1, name: 'Sable' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // `describeLoadError`'s sentence, not one this class invented — there is one place error
    // copy lives, and it is not here (spec §5).
    expect(result.message).toMatch(/does not match schema version 1/);
  });

  it('explains a document from a newer build rather than trying to read it', () => {
    const result = CharacterFile.read(JSON.stringify({ schemaVersion: 99, id: 'x' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/newer version of the app/);
  });
});
