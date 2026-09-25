import { describe, expect, it } from 'vitest';
import { CharacterFile, documentOf, portraitOf } from './characterFile.js';
import { createCharacterSheet } from './characterSheet.js';

const CREATED_AT = new Date('2026-07-25T09:41:00.000Z');
const EXPORTED_AT = new Date('2026-09-22T17:00:00.000Z');
const PORTRAIT = 'data:image/jpeg;base64,/9j/4AAQ';

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

  it('writes { sheet, portrait } as pretty-printed JSON ending in a newline', () => {
    const sheet = filled();
    sheet.setPortrait(PORTRAIT);
    const text = CharacterFile.of(sheet, EXPORTED_AT).text;

    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n    "name": "Sable Nightwind",');
    expect(JSON.parse(text)).toEqual({ sheet: sheet.toDocument(), portrait: PORTRAIT });
  });

  it('writes portrait: null rather than leaving the key out, so every file has one shape', () => {
    const parsed: unknown = JSON.parse(CharacterFile.of(filled(), EXPORTED_AT).text);
    expect(parsed).toHaveProperty('portrait', null);
  });
});

describe('CharacterFile.read', () => {
  it('round-trips an exported character', () => {
    const sheet = filled();
    const result = CharacterFile.read(CharacterFile.of(sheet, EXPORTED_AT).text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The document id included: it is what lets `library.add` recognise a character already here.
    expect(documentOf(result.file)).toEqual(sheet.toDocument());
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

  it('round-trips the portrait beside the document, never inside it', () => {
    const sheet = filled();
    sheet.setPortrait(PORTRAIT);
    const result = CharacterFile.read(CharacterFile.of(sheet, EXPORTED_AT).text);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(portraitOf(result.file)).toBe(PORTRAIT);
    expect(JSON.stringify(documentOf(result.file))).not.toContain('base64');
  });

  it('still reads a bare document, as every file exported before portraits was', () => {
    const doc = filled().toDocument();
    const result = CharacterFile.read(JSON.stringify(doc));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(documentOf(result.file)).toEqual({ ...doc, id: documentOf(result.file).id });
    expect(portraitOf(result.file)).toBeNull();
  });

  it.each([
    ['an SVG portrait', { portrait: 'data:image/svg+xml;base64,PHN2Zz4=' }, /portrait/],
    ['an unknown key beside sheet', { portrait: null, image: PORTRAIT }, /image/],
    ['a missing portrait key', {}, /portrait/],
  ])('refuses an envelope with %s, naming it', (_label, rest, named) => {
    const result = CharacterFile.read(JSON.stringify({ sheet: filled().toDocument(), ...rest }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/^This is not a character file\./);
    expect(result.message).toMatch(named);
  });

  it('reports a bad sheet inside an envelope as the document problem it is', () => {
    const text = JSON.stringify({ sheet: { schemaVersion: 99 }, portrait: null });
    const result = CharacterFile.read(text);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/newer version of the app/);
  });

  it('explains a document from a newer build rather than trying to read it', () => {
    const result = CharacterFile.read(JSON.stringify({ schemaVersion: 99, id: 'x' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/newer version of the app/);
  });
});
