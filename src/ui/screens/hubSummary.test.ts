import { sheetData } from '../fixtures.js';
import type { SheetData } from './CharacterHub.js';
import { summariseSections } from './hubSummary.js';

const item = sheetData.inventory.items[0]!;
const spell = sheetData.spellList.uncategorized[0] ?? sheetData.spellList.categories[0]!.items[0]!;
const counter = sheetData.counters.uncategorized[0] ?? sheetData.counters.categories[0]!.items[0]!;
const feat =
  sheetData.featsAndTraits.uncategorized[0] ?? sheetData.featsAndTraits.categories[0]!.items[0]!;
const gear = sheetData.equipment.other[0]!;

const empty: SheetData = {
  ...sheetData,
  journalAndNotes: { days: [], notes: '' },
  inventory: { coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 }, items: [] },
  featsAndTraits: { categories: [], uncategorized: [] },
  equipment: { weapons: [], other: [], attuned: [], equipped: [] },
  spellList: { categories: [], uncategorized: [], spellcasting: [] },
  counters: {
    categories: [],
    uncategorized: [],
    spellSlots: [1, 2, 3].map((level) => ({ level, current: 0, total: 0 })),
  },
};

describe('summariseSections', () => {
  it('says so when a section holds nothing', () => {
    const lines = summariseSections(empty);
    for (const key of ['journal', 'inventory', 'feats', 'equipment', 'spells', 'counters'] as const)
      expect(lines[key]).toBe('Nothing yet');
  });

  it('counts journal days, singular and plural', () => {
    expect(
      summariseSections({ ...empty, journalAndNotes: { days: ['a'], notes: '' } }).journal,
    ).toBe('1 day');
    expect(
      summariseSections({ ...empty, journalAndNotes: { days: ['a', 'b', 'c'], notes: '' } })
        .journal,
    ).toBe('3 days');
  });

  // Each coin as typed, in the sheet's order, zeros left out — never converted or added up.
  it('lists items and the coins that are not zero', () => {
    const inventory = { coins: { pp: 0, gp: 45, ep: 0, sp: 3, cp: 0 }, items: [item, item] };
    expect(summariseSections({ ...empty, inventory }).inventory).toBe('2 items · 45 gp · 3 sp');
    const coinsOnly = { coins: { pp: 1, gp: 0, ep: 0, sp: 0, cp: 0 }, items: [] };
    expect(summariseSections({ ...empty, inventory: coinsOnly }).inventory).toBe('1 pp');
  });

  it('counts feats across every category', () => {
    const featsAndTraits = {
      categories: [{ id: 'c', name: 'Combat', items: [feat, feat] }],
      uncategorized: [feat],
    };
    expect(summariseSections({ ...empty, featsAndTraits }).feats).toBe('3 entries');
  });

  it('counts gear, then what is equipped and attuned', () => {
    const equipment = {
      weapons: [],
      other: [gear, gear, gear],
      attuned: [gear],
      equipped: [gear, gear],
    };
    expect(summariseSections({ ...empty, equipment }).equipment).toBe(
      '3 items · 2 equipped · 1 attuned',
    );
  });

  it('counts prepared spells out of all of them', () => {
    const spellList = {
      categories: [{ id: 'c', name: 'Combat', items: [{ ...spell, prepared: true }] }],
      uncategorized: [
        { ...spell, prepared: false },
        { ...spell, prepared: true },
      ],
      spellcasting: [],
    };
    expect(summariseSections({ ...empty, spellList }).spells).toBe('2 of 3 prepared');
  });

  it('shows the spell slots in use, then the other counters', () => {
    const counters = {
      categories: [],
      uncategorized: [counter, counter],
      spellSlots: [
        { level: 1, current: 4, total: 4 },
        { level: 2, current: 1, total: 2 },
        { level: 3, current: 0, total: 0 },
      ],
    };
    expect(summariseSections({ ...empty, counters }).counters).toBe('1st 4/4 · 2nd 1/2 · 2 more');
  });

  it('shows the numbers read every session on abilities', () => {
    const abilitiesAndSkills = {
      ...empty.abilitiesAndSkills,
      proficiencyBonus: 3,
      passivePerception: 14,
      speed: 30,
    };
    expect(summariseSections({ ...empty, abilitiesAndSkills }).abilities).toBe(
      'Prof +3 · Pas. per. 14 · Speed 30',
    );
  });
});
