import type { SheetActions, SheetData } from './screens/CharacterHub.js';
import type {
  AbilitiesAndSkillsActions,
  AbilitiesAndSkillsView,
  AbilityView,
  CharacterRow,
  CharacterView,
  CountersActions,
  CountersView,
  EquipmentActions,
  EquipmentItemView,
  EquipmentView,
  FeatsAndTraitsActions,
  FeatsAndTraitsView,
  InventoryActions,
  InventoryView,
  JournalAndNotesActions,
  JournalAndNotesView,
  SkillView,
  SpellListActions,
  SpellListView,
  VitalsActions,
  WeaponView,
} from './types.js';

/**
 * Story data. Sable Nightwind and her two companions are the wireframe's own sample characters,
 * kept so a story can be compared against `docs/start/Wireframe.html` side by side.
 *
 * These are `*View` literals, not documents and not business objects. Once the sheet is wired, a
 * story that wants live behaviour builds a `CharacterSheetBO` from a fixture document and maps
 * it to these same shapes — the components do not change.
 */
export const sable: CharacterView = {
  id: 'sable',
  name: 'Sable Nightwind',
  level: 7,
  classes: [
    { id: 'c1', name: 'Rogue (Arcane Trickster)', level: 5 },
    { id: 'c2', name: 'Wizard (Evoker)', level: 2 },
  ],
  hitPoints: { current: 38, total: 45, temporary: 5 },
  hitDices: [
    { size: 6, current: 2, total: 2 },
    { size: 8, current: 3, total: 5 },
  ],
  armorClass: 15,
  initiative: 3,
  portrait: null,
};

export const blankCharacter: CharacterView = {
  id: 'blank',
  name: 'Unnamed character',
  level: 0,
  classes: [],
  hitPoints: { current: 0, total: 0, temporary: 0 },
  hitDices: [],
  armorClass: 10,
  initiative: 0,
  portrait: null,
};

export const characterRows: CharacterRow[] = [
  {
    ok: true,
    id: sable.id,
    name: sable.name,
    level: sable.level,
    updatedAt: '2026-09-24T19:12:00.000Z',
    portrait: null,
  },
  {
    ok: true,
    id: 'thorne',
    name: 'Thorne Ironfell',
    level: 8,
    updatedAt: '2026-09-20T21:40:00.000Z',
    portrait: null,
  },
  {
    ok: true,
    id: 'wren',
    name: 'Wren Duskwhisper',
    level: 4,
    updatedAt: '2026-08-02T17:05:00.000Z',
    portrait: null,
  },
];

/** What criterion 15 looks like: listed, flagged, and openable in the raw-JSON editor. */
export const damagedRow: CharacterRow = {
  ok: false,
  id: 'broken',
  message: 'Written by a newer version of this app (schema version 3).',
};

export const featsAndTraits: FeatsAndTraitsView = {
  categories: [
    {
      id: 'cat-rogue',
      name: 'Rogue',
      items: [
        {
          id: 'f1',
          name: 'Sneak Attack',
          description:
            '+3d6 once per turn when you have advantage or an ally is adjacent to the target.',
        },
        {
          id: 'f2',
          name: 'Cunning Action',
          description: 'Bonus action to Dash, Disengage, or Hide.',
        },
        {
          id: 'f3',
          name: 'Uncanny Dodge',
          description: 'Reaction to halve damage from one attacker you can see.',
        },
      ],
    },
    {
      id: 'cat-wizard',
      name: 'Wizard',
      items: [
        {
          id: 'f4',
          name: 'Arcane Recovery',
          description:
            'Once per day on a short rest, recover spell slots up to half your wizard level.',
        },
        {
          id: 'f5',
          name: 'Sculpt Spells',
          description: 'Protect allies from your own evocation spells.',
        },
      ],
    },
    { id: 'cat-empty', name: 'Background', items: [] },
  ],
  uncategorized: [
    { id: 'f6', name: 'Darkvision', description: 'See in dim light within 60 ft as if bright.' },
  ],
};

export const emptyFeatsAndTraits: FeatsAndTraitsView = { categories: [], uncategorized: [] };

export const journalAndNotes: JournalAndNotesView = {
  days: [
    'Arrived in Barovia. The mists closed behind us; there is no road back. A funeral in the village square.',
    'Met Ireena Kolyana. Strahd knows we are here.',
    'Windmill on the hill — Old Bonegrinder. We did not linger.',
  ],
  notes:
    'Find the Sunsword. Tome of Strahd location still unknown. Madam Eva reading pointed to the Amber Temple.',
};

export const inventory: InventoryView = {
  coins: { pp: 2, gp: 84, ep: 0, sp: 37, cp: 12 },
  items: [
    {
      id: 'i1',
      name: 'Thieves Tools',
      description: 'Proficient. Used for locks and traps.',
      count: 1,
    },
    { id: 'i2', name: 'Potion of Healing', description: 'Regain 2d4+2 HP as an action.', count: 3 },
    { id: 'i3', name: 'Rations', description: 'Days of trail food.', count: 5 },
    { id: 'i4', name: 'Grappling Hook', description: '', count: 1 },
  ],
};

/** Shortbow has no attack roll entered yet, so the stories show both kinds of weapon row. */
const weapons: WeaponView[] = [
  {
    id: 'e1',
    name: 'Rapier',
    description: '1d8 piercing, finesse.',
    attuned: false,
    equipped: true,
    attack: { ability: 'dexterity', attackBonus: 6, damage: '1d8+3 piercing' },
  },
  {
    id: 'e2',
    name: 'Shortbow',
    description: '1d6 piercing, range 80/320.',
    attuned: false,
    equipped: false,
    attack: null,
  },
  {
    id: 'e3',
    name: 'Dagger (x2)',
    description: '1d4 piercing, finesse, thrown 20/60.',
    attuned: false,
    equipped: true,
    attack: { ability: 'dexterity', attackBonus: 6, damage: '1d4+3 piercing' },
  },
];

const otherEquipment: EquipmentItemView[] = [
  {
    id: 'e4',
    name: 'Cloak of Elvenkind',
    description: 'Advantage on Stealth to hide; disadvantage on Perception to see you.',
    attuned: true,
    equipped: true,
  },
  {
    id: 'e5',
    name: 'Studded Leather',
    description: 'AC 12 + Dex.',
    attuned: false,
    equipped: true,
  },
];

export const equipment: EquipmentView = {
  weapons,
  other: otherEquipment,
  // Derived by filtering both lists — exactly how a wired story gets them from
  // `EquipmentBO.attuned` / `.equipped`. Never stored (spec §3.1).
  attuned: [...weapons, ...otherEquipment].filter((item) => item.attuned),
  equipped: [...weapons, ...otherEquipment].filter((item) => item.equipped),
};

export const spellList: SpellListView = {
  spellcasting: [{ ability: 'intelligence', attackBonus: 6, saveDc: 14 }],
  categories: [
    {
      id: 'sc1',
      name: 'Combat',
      items: [
        {
          id: 's1',
          name: 'Fire Bolt',
          description: 'Ranged spell attack, 2d10 fire.',
          level: 'c',
          prepared: true,
        },
        {
          id: 's2',
          name: 'Fireball',
          description: '20-ft radius, 8d6 fire; Dex save for half.',
          level: 3,
          prepared: true,
        },
        {
          id: 's3',
          name: 'Shield',
          description: 'Reaction; +5 AC until your next turn.',
          level: 1,
          prepared: true,
        },
      ],
    },
    {
      id: 'sc2',
      name: 'Utility',
      items: [
        {
          id: 's4',
          name: 'Mage Hand',
          description: 'Spectral hand manipulates objects at range.',
          level: 'c',
          prepared: true,
        },
        {
          id: 's5',
          name: 'Disguise Self',
          description: 'Change your appearance for 1 hour.',
          level: 1,
          prepared: false,
        },
        {
          id: 's6',
          name: 'Misty Step',
          description: 'Bonus action; teleport up to 30 ft.',
          level: 2,
          prepared: true,
        },
      ],
    },
  ],
  uncategorized: [
    {
      id: 's7',
      name: 'Detect Magic',
      description: 'Ritual. Sense magic within 30 ft.',
      level: 1,
      prepared: false,
    },
  ],
};

export const counters: CountersView = {
  spellSlots: [
    { level: 1, current: 4, total: 4 },
    { level: 2, current: 1, total: 2 },
    ...[3, 4, 5, 6, 7, 8, 9].map((level) => ({ level, current: 0, total: 0 })),
  ],
  categories: [
    {
      id: 'cc1',
      name: 'Class Features',
      items: [
        {
          id: 'ct1',
          name: 'Arcane Recovery',
          description: 'Recover expended spell slots, once per day.',
          current: 1,
          total: 1,
        },
      ],
    },
    {
      id: 'cc2',
      name: 'Items',
      items: [
        {
          id: 'ct2',
          name: 'Wand of Magic Missiles',
          description: 'Regains 1d6+1 charges daily at dawn.',
          current: 5,
          total: 7,
        },
      ],
    },
  ],
  uncategorized: [
    {
      id: 'ct3',
      name: 'Inspiration',
      // current 0 of 1, so a story shows a spent counter dimmed.
      description: 'DM-granted; spend for advantage.',
      current: 0,
      total: 1,
    },
  ],
};

const ability = (
  score: number,
  modifier: number,
  savingThrowModifier: number,
  savingThrowProficient = false,
): AbilityView => ({ score, modifier, savingThrowModifier, savingThrowProficient });

const skill = (modifier: number, proficient = false, expertise = false): SkillView => ({
  modifier,
  proficient,
  expertise,
});

export const abilitiesAndSkills: AbilitiesAndSkillsView = {
  proficiencyBonus: 3,
  passivePerception: 14,
  speed: 30,
  initiative: 3,
  abilities: {
    strength: ability(10, 0, 0),
    dexterity: ability(17, 3, 6, true),
    constitution: ability(13, 1, 1),
    intelligence: ability(16, 3, 6, true),
    wisdom: ability(12, 1, 1),
    charisma: ability(14, 2, 2),
  },
  skills: {
    acrobatics: skill(6, true),
    animalHandling: skill(1),
    arcana: skill(6, true),
    athletics: skill(0),
    deception: skill(5, true),
    history: skill(3),
    insight: skill(4, true),
    intimidation: skill(2),
    investigation: skill(6, true),
    medicine: skill(1),
    nature: skill(3),
    perception: skill(4, true),
    performance: skill(2),
    persuasion: skill(5, true),
    religion: skill(3),
    sleightOfHand: skill(9, true, true),
    stealth: skill(9, true, true),
    survival: skill(1),
  },
};

export const sableJson = JSON.stringify(
  {
    schemaVersion: 3,
    id: '6d0b0f7e-3c41-4a2a-9f6f-2a1f0c9d8e77',
    name: 'Sable Nightwind',
    updatedAt: '2026-09-20T18:04:11.000Z',
    classes: [
      { id: 'b1f0e2a4-1111-4a2a-9f6f-2a1f0c9d8e01', name: 'Rogue (Arcane Trickster)', level: 5 },
      { id: 'b1f0e2a4-2222-4a2a-9f6f-2a1f0c9d8e02', name: 'Wizard (Evoker)', level: 2 },
    ],
    hitPoints: { current: 38, total: 45, temporary: 5 },
    hitDices: { '6': { current: 2, total: 2 }, '8': { current: 3, total: 5 } },
    armorClass: 15,
  },
  null,
  2,
);

/** Everything the hub renders, for the stories that show the whole sheet. */
export const sheetData: SheetData = {
  character: sable,
  journalAndNotes,
  inventory,
  featsAndTraits,
  equipment,
  spellList,
  counters,
  abilitiesAndSkills,
};

/** No-op actions, so a story that is only about layout does not need a stub each. */
export const noVitalsActions: VitalsActions = {
  renameCharacter: () => null,
  setCurrentHitPoints: () => {},
  setTotalHitPoints: () => {},
  setTemporaryHitPoints: () => {},
  setArmorClass: () => {},
  setInitiative: () => {},
  setPortrait: () => Promise.resolve(null),
  removePortrait: () => {},
  addClass: () => null,
  renameClass: () => null,
  setClassLevel: () => {},
  removeClass: () => {},
  addHitDie: () => null,
  setHitDieCurrent: () => {},
  setHitDieTotal: () => {},
  removeHitDie: () => {},
};

export const noFeatsActions: FeatsAndTraitsActions = {
  addFeat: () => {},
  renameFeat: () => null,
  setFeatDescription: () => {},
  moveFeat: () => {},
  removeFeat: () => {},
  createCategory: () => null,
  renameCategory: () => null,
  removeCategory: () => {},
};

export const noJournalActions: JournalAndNotesActions = {
  appendDay: () => {},
  setDayText: () => {},
  deleteNewestDay: () => {},
  setNotes: () => {},
};

export const noInventoryActions: InventoryActions = {
  setCoin: () => {},
  addItem: () => {},
  renameItem: () => null,
  setItemDescription: () => {},
  setItemCount: () => {},
  removeItem: () => {},
};

export const noEquipmentActions: EquipmentActions = {
  addWeapon: () => {},
  addOther: () => {},
  setWeaponAttackAbility: () => {},
  setWeaponAttackBonus: () => {},
  setWeaponAttackDamage: () => null,
  renameEquipment: () => null,
  setEquipmentDescription: () => {},
  setAttuned: () => {},
  setEquipped: () => {},
  removeEquipment: () => {},
};

export const noSpellListActions: SpellListActions = {
  addSpell: () => {},
  addSpellcasting: () => {},
  setSpellAttackBonus: () => {},
  setSpellSaveDc: () => {},
  removeSpellcasting: () => {},
  renameSpell: () => null,
  setSpellDescription: () => {},
  setSpellLevel: () => {},
  setSpellPrepared: () => {},
  moveSpell: () => {},
  removeSpell: () => {},
  createCategory: () => null,
  renameCategory: () => null,
  removeCategory: () => {},
};

export const noCountersActions: CountersActions = {
  addCounter: () => {},
  renameCounter: () => null,
  setCounterDescription: () => {},
  setCounterCurrent: () => {},
  setCounterTotal: () => {},
  moveCounter: () => {},
  removeCounter: () => {},
  setSpellSlotCurrent: () => {},
  setSpellSlotTotal: () => {},
  createCategory: () => null,
  renameCategory: () => null,
  removeCategory: () => {},
};

export const noAbilitiesActions: AbilitiesAndSkillsActions = {
  setProficiencyBonus: () => {},
  setPassivePerception: () => {},
  setSpeed: () => {},
  setInitiative: () => {},
  setAbilityScore: () => {},
  setAbilityModifier: () => {},
  setSavingThrowModifier: () => {},
  setSavingThrowProficient: () => {},
  setSkillModifier: () => {},
  setSkillProficient: () => {},
  setSkillExpertise: () => {},
};

export const noSheetActions: SheetActions = {
  vitals: noVitalsActions,
  journalAndNotes: noJournalActions,
  inventory: noInventoryActions,
  featsAndTraits: noFeatsActions,
  equipment: noEquipmentActions,
  spellList: noSpellListActions,
  counters: noCountersActions,
  abilitiesAndSkills: noAbilitiesActions,
};
