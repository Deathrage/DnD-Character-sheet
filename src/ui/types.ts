/**
 * The shapes the UI renders and the callbacks it fires.
 *
 * These are **not** imported from `src/business`, and not because of the layer rule — `ui` may
 * import `business`. They are declared here because the components are presentational: data in,
 * callbacks out. That is what lets a Storybook story be a literal, and what keeps a component
 * from caring whether a value arrived from a `CharacterSheetBO`, a fixture, or a test.
 *
 * Every field below is spelled the way the corresponding business object spells it
 * (`current`/`total`/`temporary`, `level`, `size`), so wiring is a one-line read per field
 * rather than a translation layer. Where the business layer throws a `RuleViolation` the UI is
 * expected to present — `DUPLICATE_NAME` and `EMPTY_NAME` — the callback returns a message
 * instead of `void`; see `NameResult`.
 */

import type { Crop } from './portrait.js';
import type { AbilityKey, CoinKey, SkillKey, SpellLevel } from './reference.js';

/**
 * `null` on success, otherwise the message to show beside the field.
 *
 * The container wiring is `try { bo.setName(v); return null } catch (e) { return message(e) }`.
 * Returning the message rather than throwing keeps the rejection local to the dialog that
 * caused it: a duplicate class name is a thing the player typed, not an error condition.
 */
export type NameResult = string | null;

// Reference data — fixed key sets and display order — lives in `reference.ts`; these are its
// key unions, re-exported so a consumer needs one import rather than two.
export type { AbilityKey, CoinKey, SkillKey, SpellLevel } from './reference.js';

export interface HitPointsView {
  current: number;
  total: number;
  temporary: number;
}

export interface ClassView {
  id: string;
  name: string;
  level: number;
}

/** Keyed by die size in the document; the size *is* its identity, so there is no id. */
export interface HitDieView {
  size: number;
  current: number;
  total: number;
}

export interface CharacterView {
  id: string;
  name: string;
  /** Derived on the business facade as the sum of class levels. Never stored. */
  level: number;
  classes: ClassView[];
  hitPoints: HitPointsView;
  hitDices: HitDieView[];
  armorClass: number;
  /** Stored under abilities and skills; the header shows it too, beside armor class. */
  speed: number;
  /** A data URL, or `null` when none has been picked. */
  portrait: string | null;
}

export interface VitalsActions {
  renameCharacter(name: string): NameResult;
  setCurrentHitPoints(value: number): void;
  setTotalHitPoints(value: number): void;
  setTemporaryHitPoints(value: number): void;
  setArmorClass(value: number): void;
  setSpeed(value: number): void;
  /** Crops and compresses the picked image and stores it; the message when it could not be used. */
  setPortrait(file: Blob, crop: Crop): Promise<NameResult>;
  removePortrait(): void;
  addClass(name: string): NameResult;
  renameClass(id: string, name: string): NameResult;
  setClassLevel(id: string, level: number): void;
  removeClass(id: string): void;
  addHitDie(size: number): NameResult;
  setHitDieCurrent(size: number, value: number): void;
  setHitDieTotal(size: number, value: number): void;
  removeHitDie(size: number): void;
}

/** One row of the character list. Mirrors the repository's `ListEntry` (spec §5). */
export type CharacterRow =
  | {
      ok: true;
      id: string;
      name: string;
      level: number;
      /** When it was last edited, as an ISO timestamp. */
      updatedAt: string;
      portrait: string | null;
    }
  /**
   * A document that failed to load still appears, flagged (criterion 15). `message` is
   * `describeLoadError(entry.error)` — the UI takes the sentence, not the taxonomy, because
   * `LoadError` lives in `data` and `ui` may not import it.
   */
  | { ok: false; id: string; message: string };

// ---------------------------------------------------------------------------
// Categorized sections. Feats & Traits, Spell List and Counters share one shape
// in the document, one business object (`CategorizedBO`) and one UI component
// (`CategorizedSection`) — so they share these types too.
// ---------------------------------------------------------------------------

/** Every categorized item is a name, a description and an id. Each section adds its own fields. */
export interface NamedItemView {
  id: string;
  name: string;
  description: string;
}

export interface CategoryView<T> {
  id: string;
  name: string;
  items: T[];
}

export interface CategorizedView<T> {
  categories: CategoryView<T>[];
  uncategorized: T[];
}

/** The category rules, identical in all three sections. `CategorizedSection` owns these. */
export interface CategoryActions {
  createCategory(name: string): NameResult;
  renameCategory(id: string, name: string): NameResult;
  /** Moves the category's items to Uncategorized, then deletes it. */
  removeCategory(id: string): void;
}

export type FeatView = NamedItemView;
export type FeatsAndTraitsView = CategorizedView<FeatView>;

export interface FeatsAndTraitsActions extends CategoryActions {
  /** `categoryId` is `null` for Uncategorized, throughout. */
  addFeat(categoryId: string | null, feat: { name: string; description: string }): void;
  /** Rejectable: `NamedItemBO.setName` throws `EMPTY_NAME` on a blank. */
  renameFeat(id: string, name: string): NameResult;
  setFeatDescription(id: string, description: string): void;
  moveFeat(id: string, categoryId: string | null): void;
  removeFeat(id: string): void;
}

export interface SpellView extends NamedItemView {
  level: SpellLevel;
  prepared: boolean;
}

/** One spellcasting ability's two numbers, as the player entered them. */
export interface SpellcastingView {
  ability: AbilityKey;
  attackBonus: number;
  saveDc: number;
}

/** The spell categories, plus spellcasting beside them — the way `CountersView` adds its slots. */
export interface SpellListView extends CategorizedView<SpellView> {
  /** STR to CHA, present abilities only. */
  spellcasting: SpellcastingView[];
}

export interface SpellListActions extends CategoryActions {
  addSpell(
    categoryId: string | null,
    spell: { name: string; description: string; level: SpellLevel; prepared: boolean },
  ): void;
  renameSpell(id: string, name: string): NameResult;
  setSpellDescription(id: string, description: string): void;
  setSpellLevel(id: string, level: SpellLevel): void;
  setSpellPrepared(id: string, prepared: boolean): void;
  moveSpell(id: string, categoryId: string | null): void;
  removeSpell(id: string): void;
  /** The picker offers only unused abilities, so a duplicate is a bug and stays loud. */
  addSpellcasting(ability: AbilityKey, init: { attackBonus: number; saveDc: number }): void;
  setSpellAttackBonus(ability: AbilityKey, value: number): void;
  setSpellSaveDc(ability: AbilityKey, value: number): void;
  removeSpellcasting(ability: AbilityKey): void;
}

export interface CounterView extends NamedItemView {
  current: number;
  total: number;
}

/** The nine spell-slot levels sit beside the categories in the document, not inside them. */
export interface SpellSlotView {
  level: number;
  current: number;
  total: number;
}

export interface CountersView extends CategorizedView<CounterView> {
  spellSlots: SpellSlotView[];
}

export interface CountersActions extends CategoryActions {
  addCounter(
    categoryId: string | null,
    counter: { name: string; description: string; total: number },
  ): void;
  renameCounter(id: string, name: string): NameResult;
  setCounterDescription(id: string, description: string): void;
  setCounterCurrent(id: string, value: number): void;
  setCounterTotal(id: string, value: number): void;
  moveCounter(id: string, categoryId: string | null): void;
  removeCounter(id: string): void;
  setSpellSlotCurrent(level: number, value: number): void;
  setSpellSlotTotal(level: number, value: number): void;
}

// ---------------------------------------------------------------------------
// The four sections with shapes of their own
// ---------------------------------------------------------------------------

export interface InventoryItemView extends NamedItemView {
  count: number;
}

export interface InventoryView {
  coins: Record<CoinKey, number>;
  items: InventoryItemView[];
}

export interface InventoryActions {
  setCoin(coin: CoinKey, value: number): void;
  addItem(item: { name: string; description: string; count: number }): void;
  renameItem(id: string, name: string): NameResult;
  setItemDescription(id: string, description: string): void;
  setItemCount(id: string, count: number): void;
  removeItem(id: string): void;
}

export interface EquipmentItemView extends NamedItemView {
  attuned: boolean;
  equipped: boolean;
}

/** A weapon's attack roll as the player entered it. Nothing here is computed. */
export interface WeaponAttackView {
  ability: AbilityKey;
  attackBonus: number;
  damage: string;
}

/**
 * A weapon is an equipment item plus its attack roll. Only the Weapons list holds these; a row
 * tells the two apart by whether the `attack` key is present at all.
 */
export interface WeaponView extends EquipmentItemView {
  /** `null` when no attack roll has been entered. */
  attack: WeaponAttackView | null;
}

/** Which stored list an item lives in. There are two, and nothing moves between them. */
export type EquipmentSlot = 'weapons' | 'other';

export interface EquipmentView {
  weapons: WeaponView[];
  other: EquipmentItemView[];
  /**
   * Derived on the facade by filtering both lists — never stored (spec §3.1). They are separate
   * fields here rather than recomputed in the component so the component cannot disagree with
   * the business object about what "attuned" means. A weapon here keeps its attack.
   */
  attuned: (WeaponView | EquipmentItemView)[];
  equipped: (WeaponView | EquipmentItemView)[];
}

export interface NewEquipmentItem {
  name: string;
  description: string;
  attuned: boolean;
  equipped: boolean;
}

export interface EquipmentActions {
  /**
   * Two adds rather than one with a slot: only a weapon has an attack, and one action taking an
   * optional attack for either list would have to drop it silently for other equipment.
   */
  addWeapon(item: NewEquipmentItem & { attack: WeaponAttackView | null }): void;
  addOther(item: NewEquipmentItem): void;
  renameEquipment(id: string, name: string): NameResult;
  setEquipmentDescription(id: string, description: string): void;
  setAttuned(id: string, attuned: boolean): void;
  setEquipped(id: string, equipped: boolean): void;
  removeEquipment(id: string): void;
  /** `null` clears the whole attack, bonus and damage included. */
  setWeaponAttackAbility(id: string, ability: AbilityKey | null): void;
  setWeaponAttackBonus(id: string, value: number): void;
  /** Rejectable: damage over 80 characters is `TOO_LONG`. */
  setWeaponAttackDamage(id: string, damage: string): NameResult;
}

export interface JournalAndNotesView {
  /** Index *is* the day index, so this is the whole contract: position carries the meaning. */
  days: string[];
  notes: string;
}

export interface JournalAndNotesActions {
  /** Appends at the end only. */
  appendDay(): void;
  setDayText(index: number, text: string): void;
  /** The newest day only; no other index is deletable. */
  deleteNewestDay(): void;
  setNotes(notes: string): void;
}

export interface AbilityView {
  score: number;
  modifier: number;
  savingThrowModifier: number;
  savingThrowProficient: boolean;
}

export interface SkillView {
  modifier: number;
  proficient: boolean;
  expertise: boolean;
}

export interface AbilitiesAndSkillsView {
  proficiencyBonus: number;
  passivePerception: number;
  speed: number;
  abilities: Record<AbilityKey, AbilityView>;
  skills: Record<SkillKey, SkillView>;
}

export interface AbilitiesAndSkillsActions {
  setProficiencyBonus(value: number): void;
  setPassivePerception(value: number): void;
  setSpeed(value: number): void;
  setAbilityScore(key: AbilityKey, value: number): void;
  setAbilityModifier(key: AbilityKey, value: number): void;
  setSavingThrowModifier(key: AbilityKey, value: number): void;
  setSavingThrowProficient(key: AbilityKey, value: boolean): void;
  setSkillModifier(key: SkillKey, value: number): void;
  setSkillProficient(key: SkillKey, value: boolean): void;
  setSkillExpertise(key: SkillKey, value: boolean): void;
}

export type SectionKey =
  'journal' | 'inventory' | 'feats' | 'equipment' | 'spells' | 'counters' | 'abilities';

export interface SectionTile {
  key: SectionKey;
  icon: string;
  title: string;
  subtitle: string;
}

/** The hub grid, in the wireframe's order and with its glyphs. All seven always render. */
export const SECTIONS: readonly SectionTile[] = [
  { key: 'journal', icon: '✎', title: 'Journal & Notes', subtitle: 'log & freeform' },
  { key: 'inventory', icon: '◉', title: 'Inventory', subtitle: 'coins & items' },
  { key: 'feats', icon: '✦', title: 'Feats & Traits', subtitle: 'by category' },
  { key: 'equipment', icon: '⚔', title: 'Equipment', subtitle: 'weapons & gear' },
  { key: 'spells', icon: '✧', title: 'Spell List', subtitle: 'prepared & levels' },
  { key: 'counters', icon: '◴', title: 'Counters', subtitle: 'slots & resources' },
  { key: 'abilities', icon: '⭃', title: 'Abilities & Skills', subtitle: 'scores & skills' },
];

/**
 * Which tiles are live. All seven now are; the prop remains because HubGrid should not have
 * to be edited to stand a section down again, and a story shows the inert state.
 */
export const WIRED_SECTIONS: readonly SectionKey[] = SECTIONS.map((section) => section.key);

/**
 * What the app can offer toward installing itself (see `install.ts`): the browser's own prompt,
 * written steps where the browser installs but will not let a page start it, or nothing.
 */
export type InstallView =
  | { kind: 'prompt' }
  | { kind: 'steps'; steps: string }
  | { kind: 'installed' }
  | { kind: 'unavailable' };

// ---------------------------------------------------------------------------
// Cloud backup
// ---------------------------------------------------------------------------

/** One upload of a character, as the cloud screen shows it. Times are ISO strings. */
export interface CloudVersionView {
  uploadedAt: string;
  /** `null` when the sheet cannot be read: `problem` then says why, and Restore is disabled. */
  sheetUpdatedAt: string | null;
  name: string | null;
  level: number | null;
  bytes: number;
  fromNewerApp: boolean;
  problem: string | null;
}

export interface CloudCharacterView {
  characterId: string;
  /** The newest readable version's; `null` when none is readable. */
  name: string | null;
  level: number | null;
  versions: CloudVersionView[];
}

export interface CloudView {
  status: 'unknown' | 'signedOut' | 'signingIn' | 'signedIn' | 'unavailable';
  user: { name: string | null; email: string | null; photoUrl: string | null } | null;
  characters: CloudCharacterView[];
  usedBytes: number;
  limitBytes: number;
  busy: boolean;
}

/** The Replace / Keep both question. `localUpdatedAt` is null when the local copy is damaged. */
export interface ConflictView {
  name: string;
  localUpdatedAt: string | null;
  /** The file's or the cloud version's. */
  incomingUpdatedAt: string;
}
