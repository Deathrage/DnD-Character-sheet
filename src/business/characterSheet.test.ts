import { describe, expect, it } from 'vitest';
import { autorun, isObservable } from 'mobx';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const FIXED_NOW = new Date('2026-07-25T09:41:00.000Z');
const ID = '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e';

const sheetFor = (name = 'Sable Nightwind') =>
  new CharacterSheetBO(createCharacter({ name, id: ID, now: FIXED_NOW }));

describe('CharacterSheetBO', () => {
  it('exposes the document id', () => {
    expect(sheetFor().id).toBe(ID);
  });

  it('reads and writes the name', () => {
    const sheet = sheetFor();
    sheet.setName('Wren Duskwhisper');
    expect(sheet.name).toBe('Wren Duskwhisper');
  });

  it('trims a name at the write boundary, because the schema rejects padding', () => {
    const sheet = sheetFor();
    sheet.setName('  Wren  ');
    expect(sheet.name).toBe('Wren');
  });

  it('rejects a name that is empty once trimmed', () => {
    const sheet = sheetFor();
    expect(() => sheet.setName('   ')).toThrow(
      expect.objectContaining({ code: 'EMPTY_NAME' }) as Error,
    );
  });

  it('rejects a negative armour class', () => {
    const sheet = sheetFor();
    expect(() => sheet.setArmorClass(-1)).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
  });

  it('makes the document observable, so a reader re-runs when a field changes', () => {
    const sheet = sheetFor();
    const seen: string[] = [];
    const stop = autorun(() => seen.push(sheet.name));

    sheet.setName('Wren');

    expect(seen).toEqual(['Sable Nightwind', 'Wren']);
    stop();
  });

  it('returns a plain object from toDocument, not an observable proxy', () => {
    const doc = sheetFor().toDocument();
    expect(isObservable(doc)).toBe(false);
  });

  it('toDocument reflects writes, so what is saved is what was edited', () => {
    const sheet = sheetFor();
    sheet.setName('Wren');
    sheet.setArmorClass(15);

    expect(sheet.toDocument()).toMatchObject({ name: 'Wren', armorClass: 15 });
  });

  it('keeps the document unreachable from outside, even from plain JavaScript', () => {
    const sheet = sheetFor();
    // A `#` field is enforced by the runtime; a TypeScript `private` would be erased and a cast
    // or plain JS would walk straight through it. This is the whole point of the layer.
    expect(Object.keys(sheet)).not.toContain('doc');
    expect(JSON.stringify(sheet)).not.toContain('schemaVersion');
  });

  it('derives level from the classes, and never stores it', () => {
    const sheet = sheetFor();
    expect(sheet.level).toBe(0);
    expect(sheet.toDocument()).not.toHaveProperty('level');
  });
});
