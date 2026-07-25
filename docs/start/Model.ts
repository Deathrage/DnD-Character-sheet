interface JournalAndNotes {
  // Queue where index = day index.
  // Business layer can only delete new-most item and can only insert items to the end of the array (newest day).
  // Each entry is freeform long text.
  journal: string[];

  // Freeform long text.
  notes: string;
}

interface Name {
  // Limited size text.
  name: string;
}

interface NameAndDescription extends Name {
  // Freeform long text.
  description: string;
}

interface InventoryItem extends NameAndDescription {
  count: number;
}

// Contains items not treated as equipment.
interface Inventory {
  // Each DnD coin type and count posessed.
  coins: {
    pp: number;
    gp: number;
    ep: number;
    sp: number;
    cp: number;
  };

  items: InventoryItem[];
}

interface EquipmentItem extends NameAndDescription {
  attuned: boolean;
  equipped: boolean;
}

interface Equipment {
  // EquipmentItem with attuned = true;
  attuned: Iterable<EquipmentItem>;

  // EquipmentItem with equipped = true;
  equipped: Iterable<EquipmentItem>;

  weapons: EquipmentItem[];
  other: EquipmentItem[];
}

interface Categorized<T> {
  categories: Record<string, T[]>;

  uncategorized: T[];
}

interface FeatAndTraitsItem extends NameAndDescription {}

interface FeatAndTraits extends Categorized<FeatAndTraitsItem> {}

interface SpellListItem extends NameAndDescription {
  // May be turned in enum, cantrip of spell level from 1 to 9.
  level: number | "c";

  prepared: boolean;
}

interface SpellList extends Categorized<SpellListItem> {}

interface CurrentAndTotal {
  // Positive, must be less or equal total, user can willingly set more as current so it is not validated for.
  current: number;
  // Positive
  total: number;
}

interface SpellSlotCounter extends CurrentAndTotal {}

interface CountersItem extends NameAndDescription, CurrentAndTotal {}

interface Counters extends Categorized<CountersItem> {
  spellSlots: {
    1: SpellSlotCounter;
    2: SpellSlotCounter;
    3: SpellSlotCounter;
    4: SpellSlotCounter;
    5: SpellSlotCounter;
    6: SpellSlotCounter;
    7: SpellSlotCounter;
    8: SpellSlotCounter;
    9: SpellSlotCounter;
  };
}

interface AbilitiesItem {
  // positive
  score: number;
  // Positive or negative UI must show + and -
  modifier: number;

  savingThrowModifier: number;

  proficient: boolean;

  savingThrowProficient: boolean;
}

interface SkillsItem {
  // Positive or negative UI must show + and -
  modifier: number;

  proficient: boolean;

  expertise: boolean;
}

interface AbilitiesAndSkills {
  proficiencyBonus: number;

  passivePerception: number;

  speed: number;

  abilities: {
    strength: AbilitiesItem;
    dexterity: AbilitiesItem;
    constitution: AbilitiesItem;
    intelligence: AbilitiesItem;
    wisdom: AbilitiesItem;
    charisma: AbilitiesItem;
  };

  skills: {
    acrobatics: SkillsItem;
    animalHandling: SkillsItem;
    arcana: SkillsItem;
    athletics: SkillsItem;
    deception: SkillsItem;
    history: SkillsItem;
    insight: SkillsItem;
    intimidation: SkillsItem;
    investigation: SkillsItem;
    medicine: SkillsItem;
    nature: SkillsItem;
    perception: SkillsItem;
    performance: SkillsItem;
    persuasion: SkillsItem;
    religion: SkillsItem;
    sleightOfHand: SkillsItem;
    stealth: SkillsItem;
    survival: SkillsItem;
  };
}

interface ClassItem extends Name {
  level: number;
}

interface HitPoints extends CurrentAndTotal {
  temporary: number;
}

interface HitDicesItem extends CurrentAndTotal {}

interface CharacterSheet {
  // Getter, sum of levels from classes.
  level: number;

  classes: Record<string, ClassItem>;

  hitPoints: HitPoints;

  // Number is dice type from 1 to N. In UI displayed as d{number}
  hitDices: Record<number, HitDicesItem>;

  armorClass: number;

  journalAndNotes: JournalAndNotes;

  inventory: Inventory;

  featsAndTraits: FeatAndTraits;

  equipment: Equipment;

  spellList: SpellList;

  counters: Counters;

  abilitiesAndSkills: AbilitiesAndSkills;
}
