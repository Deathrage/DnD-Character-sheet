import { describe, expect, it } from 'vitest';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('SpellBO', () => {
  it('defaults a new spell to cantrip level and unprepared', () => {
    const spell = sheetFor().spellList.add({ name: 'Fire Bolt' });
    expect([spell.level, spell.prepared]).toEqual(['c', false]);
  });

  it.each(['c', 1, 5, 9] as const)('accepts %j as a level', (level) => {
    const spell = sheetFor().spellList.add({ name: 'Fire Bolt' });
    spell.setLevel(level);
    expect(spell.level).toBe(level);
  });

  it('toggles prepared', () => {
    const spell = sheetFor().spellList.add({ name: 'Fire Bolt' });
    spell.setPrepared(true);
    expect(spell.prepared).toBe(true);
  });

  it('supports the same categories as feats, because it uses the same generic', () => {
    const sheet = sheetFor();
    const evocation = sheet.spellList.createCategory('Evocation');
    const bolt = evocation.add({ name: 'Fire Bolt' });

    bolt.moveTo(null);

    expect(evocation.items).toEqual([]);
    expect(sheet.spellList.uncategorized.map((s) => s.name)).toEqual(['Fire Bolt']);
  });

  it('writes through to the saved document', () => {
    const sheet = sheetFor();
    const spell = sheet.spellList.add({ name: 'Fire Bolt' });
    spell.setLevel(3);
    spell.setPrepared(true);

    expect(sheet.toDocument().spellList.uncategorized).toMatchObject([
      { name: 'Fire Bolt', level: 3, prepared: true },
    ]);
  });
});
