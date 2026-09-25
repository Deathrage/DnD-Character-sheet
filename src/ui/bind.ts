/**
 * The seam between `CharacterSheetBO` and the presentational components.
 *
 * The components take `*View` data and `*Actions` callbacks (see `types.ts`) and know nothing
 * about MobX or about business objects. This file is the one place that knows both: it reads a
 * business object tree into those views, and routes those callbacks back into the tree's
 * setters.
 *
 * Two things it deliberately does not do. It does not compute — every number it copies is one a
 * business object already holds. And it does not swallow a rule: a `RuleViolation` the player
 * caused (a duplicate name, an empty name, a name too long, a hit die already present) becomes
 * the message the field shows, and every other code — `NOT_AN_INTEGER`, `NEGATIVE`, `GONE`,
 * `UNKNOWN_CATEGORY` — is a bug in the caller and is rethrown loudly.
 */

import { reaction } from 'mobx';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type CharacterLibraryBO,
  type CharacterSheetBO,
  type CloudBackup,
  type EquipmentItemBO,
  RuleViolation,
  type RuleCode,
  type StorageFailure,
  type StorageGate,
} from '../business/index.js';
import { compressPortrait } from './portrait.js';
import { ABILITIES, SKILLS } from './reference.js';
import type { SheetActions, SheetData } from './screens/CharacterHub.js';
import type {
  AbilitiesAndSkillsActions,
  AbilitiesAndSkillsView,
  AbilityKey,
  AbilityView,
  CategorizedView,
  CategoryActions,
  CharacterRow,
  CharacterView,
  CloudView,
  CoinKey,
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
  NamedItemView,
  NameResult,
  SkillKey,
  SkillView,
  SpellLevel,
  SpellListActions,
  SpellListView,
  VitalsActions,
} from './types.js';

// ---------------------------------------------------------------------------
// Rules on the way back in
// ---------------------------------------------------------------------------

/**
 * The codes a player can provoke by typing. Everything else the business layer throws means the
 * UI asked for something impossible, and a message beside a field would hide it.
 */
const PRESENTABLE: readonly RuleCode[] = [
  'DUPLICATE_NAME',
  'EMPTY_NAME',
  'TOO_LONG',
  'DUPLICATE_DIE',
  'INVALID_DIE_SIZE',
];

function attempt(run: () => void): NameResult {
  try {
    run();
    return null;
  } catch (error) {
    if (error instanceof RuleViolation && PRESENTABLE.includes(error.code)) return error.message;
    throw error;
  }
}

/**
 * A component addresses everything by an id it was handed in the view it is rendering, so a miss
 * means the view and the document have gone out of step — the condition the business layer calls
 * `GONE`, reported the same way rather than as an undefined dereference two frames later.
 */
function byId<T extends { id: string }>(items: readonly T[], id: string, what: string): T {
  const found = items.find((item) => item.id === id);
  if (found === undefined) {
    throw new RuleViolation('GONE', `no ${what} with id ${id} is in the document`);
  }
  return found;
}

// ---------------------------------------------------------------------------
// Categorized sections — the shape Feats & Traits, Spell List and Counters share
// ---------------------------------------------------------------------------

/**
 * Structural, not `CategorizedBO`: that class is generic over a `*Data` shape and
 * `src/business/index.ts` withholds those aliases on purpose, so it cannot be named from here.
 * Only the members these helpers touch are listed, which is all structural assignability needs.
 */
interface CategorizedLike<TItem> {
  categories: { id: string; name: string; items: TItem[] }[];
  uncategorized: TItem[];
}

function categorizedView<TItem, TView>(
  bo: CategorizedLike<TItem>,
  view: (item: TItem) => TView,
): CategorizedView<TView> {
  return {
    categories: bo.categories.map((category) => ({
      id: category.id,
      name: category.name,
      items: category.items.map(view),
    })),
    uncategorized: bo.uncategorized.map(view),
  };
}

/** An item is addressed by id alone; which bucket holds it is the business layer's business. */
function itemById<TItem extends { id: string }>(
  bo: CategorizedLike<TItem>,
  id: string,
  what: string,
): TItem {
  return byId([...bo.uncategorized, ...bo.categories.flatMap((c) => c.items)], id, what);
}

/** Identical in all three sections, down to the method names, so it is written once. */
function categoryActions(bo: {
  categories: { id: string; setName(value: string): void; remove(): void }[];
  createCategory(name: string): unknown;
}): CategoryActions {
  return {
    createCategory: (name) =>
      attempt(() => {
        bo.createCategory(name);
      }),
    renameCategory: (id, name) => attempt(() => byId(bo.categories, id, 'category').setName(name)),
    removeCategory: (id) => byId(bo.categories, id, 'category').remove(),
  };
}

const namedItemView = (item: NamedItemView): NamedItemView => ({
  id: item.id,
  name: item.name,
  description: item.description,
});

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export function toCharacterView(sheet: CharacterSheetBO): CharacterView {
  return {
    id: sheet.id,
    name: sheet.name,
    level: sheet.level,
    classes: sheet.classes.items.map((entry) => ({
      id: entry.id,
      name: entry.name,
      level: entry.level,
    })),
    hitPoints: {
      current: sheet.hitPoints.current,
      total: sheet.hitPoints.total,
      temporary: sheet.hitPoints.temporary,
    },
    hitDices: sheet.hitDices.items.map((die) => ({
      size: die.size,
      current: die.current,
      total: die.total,
    })),
    armorClass: sheet.armorClass,
    speed: sheet.abilitiesAndSkills.speed,
    portrait: sheet.portrait,
  };
}

function journalView(sheet: CharacterSheetBO): JournalAndNotesView {
  return {
    days: sheet.journalAndNotes.days.map((day) => day.text),
    notes: sheet.journalAndNotes.notes,
  };
}

function inventoryView(sheet: CharacterSheetBO): InventoryView {
  const { coins } = sheet.inventory;
  return {
    coins: { pp: coins.pp, gp: coins.gp, ep: coins.ep, sp: coins.sp, cp: coins.cp },
    items: sheet.inventory.items.map((item) => ({ ...namedItemView(item), count: item.count })),
  };
}

const equipmentItemView = (item: EquipmentItemBO): EquipmentItemView => ({
  ...namedItemView(item),
  attuned: item.attuned,
  equipped: item.equipped,
});

function equipmentView(sheet: CharacterSheetBO): EquipmentView {
  const { equipment } = sheet;
  return {
    weapons: equipment.weapons.map(equipmentItemView),
    other: equipment.other.map(equipmentItemView),
    // Read from the facade's derived getters rather than filtered again here, so the view cannot
    // disagree with the business object about what "attuned" means.
    attuned: equipment.attuned.map(equipmentItemView),
    equipped: equipment.equipped.map(equipmentItemView),
  };
}

/** Cantrips first, then 1 to 9. A display order only: the stored order is never rewritten. */
const byLevel = (a: { level: SpellLevel }, b: { level: SpellLevel }) =>
  (a.level === 'c' ? 0 : a.level) - (b.level === 'c' ? 0 : b.level);

function spellListView(sheet: CharacterSheetBO): SpellListView {
  const view = categorizedView(sheet.spellList, (spell) => ({
    ...namedItemView(spell),
    level: spell.level,
    prepared: spell.prepared,
  }));
  // Array#sort is stable, so spells of one level keep the order the player added them in.
  view.categories.forEach((category) => category.items.sort(byLevel));
  view.uncategorized.sort(byLevel);
  return view;
}

function countersView(sheet: CharacterSheetBO): CountersView {
  return {
    ...categorizedView(sheet.counters, (counter) => ({
      ...namedItemView(counter),
      current: counter.current,
      total: counter.total,
    })),
    spellSlots: sheet.counters.spellSlots.map((slot) => ({
      level: slot.level,
      current: slot.current,
      total: slot.total,
    })),
  };
}

function abilitiesView(sheet: CharacterSheetBO): AbilitiesAndSkillsView {
  const bo = sheet.abilitiesAndSkills;
  return {
    proficiencyBonus: bo.proficiencyBonus,
    passivePerception: bo.passivePerception,
    speed: bo.speed,
    // Iterated from `reference.ts`'s display order rather than `Object.keys` of the business
    // object: the UI owns its own key list, and a divergence is then a type error on this line.
    abilities: Object.fromEntries(
      ABILITIES.map(({ key }) => {
        const ability = bo.abilities[key];
        return [
          key,
          {
            score: ability.score,
            modifier: ability.modifier,
            savingThrowModifier: ability.savingThrowModifier,
            savingThrowProficient: ability.savingThrowProficient,
          } satisfies AbilityView,
        ];
      }),
    ) as Record<AbilityKey, AbilityView>,
    skills: Object.fromEntries(
      SKILLS.map(({ key }) => {
        const skill = bo.skills[key];
        return [
          key,
          {
            modifier: skill.modifier,
            proficient: skill.proficient,
            expertise: skill.expertise,
          } satisfies SkillView,
        ];
      }),
    ) as Record<SkillKey, SkillView>,
  };
}

export function toSheetData(sheet: CharacterSheetBO): SheetData {
  const featsAndTraits: FeatsAndTraitsView = categorizedView(sheet.featsAndTraits, namedItemView);
  return {
    character: toCharacterView(sheet),
    journalAndNotes: journalView(sheet),
    inventory: inventoryView(sheet),
    featsAndTraits,
    equipment: equipmentView(sheet),
    spellList: spellListView(sheet),
    counters: countersView(sheet),
    abilitiesAndSkills: abilitiesView(sheet),
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function vitalsActions(sheet: CharacterSheetBO): VitalsActions {
  const classById = (id: string) => byId(sheet.classes.items, id, 'class');
  // A hit die has no id: the size is its identity (`hitDices.ts`), so it is looked up by size.
  const dieOfSize = (size: number) => {
    const found = sheet.hitDices.items.find((die) => die.size === size);
    if (found === undefined) {
      throw new RuleViolation('GONE', `there is no d${size} in the document`);
    }
    return found;
  };

  return {
    renameCharacter: (name) => attempt(() => sheet.setName(name)),
    setCurrentHitPoints: (value) => sheet.hitPoints.setCurrent(value),
    setTotalHitPoints: (value) => sheet.hitPoints.setTotal(value),
    setTemporaryHitPoints: (value) => sheet.hitPoints.setTemporary(value),
    setArmorClass: (value) => sheet.setArmorClass(value),
    setSpeed: (value) => sheet.abilitiesAndSkills.setSpeed(value),
    // Any failure is the file's — undecodable, or somehow still too large — so it is told to
    // the player rather than thrown out of an event handler as an unhandled rejection.
    setPortrait: async (file, crop) => {
      try {
        sheet.setPortrait(await compressPortrait(file, crop));
        return null;
      } catch {
        return 'That file could not be used as a portrait. Try a JPEG or PNG.';
      }
    },
    removePortrait: () => sheet.setPortrait(null),
    addClass: (name) =>
      attempt(() => {
        sheet.classes.add({ name });
      }),
    renameClass: (id, name) => attempt(() => classById(id).setName(name)),
    setClassLevel: (id, level) => classById(id).setLevel(level),
    removeClass: (id) => classById(id).remove(),
    addHitDie: (size) =>
      attempt(() => {
        sheet.hitDices.add(size);
      }),
    setHitDieCurrent: (size, value) => dieOfSize(size).setCurrent(value),
    setHitDieTotal: (size, value) => dieOfSize(size).setTotal(value),
    removeHitDie: (size) => dieOfSize(size).remove(),
  };
}

function journalActions(sheet: CharacterSheetBO): JournalAndNotesActions {
  const bo = sheet.journalAndNotes;
  return {
    appendDay: () => {
      bo.appendDay();
    },
    setDayText: (index, text) => {
      const day = bo.days[index];
      if (day === undefined) {
        throw new RuleViolation('GONE', `journal day ${index} is not in the document`);
      }
      day.setText(text);
    },
    deleteNewestDay: () => bo.deleteNewestDay(),
    setNotes: (notes) => bo.setNotes(notes),
  };
}

/** `CoinsBO` has one setter per denomination; `reference.ts` owns which five there are. */
const COIN_SETTER: Record<CoinKey, 'setPp' | 'setGp' | 'setEp' | 'setSp' | 'setCp'> = {
  pp: 'setPp',
  gp: 'setGp',
  ep: 'setEp',
  sp: 'setSp',
  cp: 'setCp',
};

function inventoryActions(sheet: CharacterSheetBO): InventoryActions {
  const bo = sheet.inventory;
  const item = (id: string) => byId(bo.items, id, 'inventory item');
  return {
    setCoin: (coin, value) => {
      bo.coins[COIN_SETTER[coin]](value);
    },
    addItem: (init) => {
      bo.add(init);
    },
    renameItem: (id, name) => attempt(() => item(id).setName(name)),
    setItemDescription: (id, description) => item(id).setDescription(description),
    setItemCount: (id, count) => item(id).setCount(count),
    removeItem: (id) => item(id).remove(),
  };
}

function equipmentActions(sheet: CharacterSheetBO): EquipmentActions {
  const bo = sheet.equipment;
  const item = (id: string) => byId([...bo.weapons, ...bo.other], id, 'equipment item');
  return {
    addEquipment: (slot, init) => {
      if (slot === 'weapons') bo.addWeapon(init);
      else bo.addOther(init);
    },
    renameEquipment: (id, name) => attempt(() => item(id).setName(name)),
    setEquipmentDescription: (id, description) => item(id).setDescription(description),
    setAttuned: (id, attuned) => item(id).setAttuned(attuned),
    setEquipped: (id, equipped) => item(id).setEquipped(equipped),
    removeEquipment: (id) => item(id).remove(),
  };
}

function featsActions(sheet: CharacterSheetBO): FeatsAndTraitsActions {
  const bo = sheet.featsAndTraits;
  const feat = (id: string) => itemById(bo, id, 'feat');
  const category = (id: string) => byId(bo.categories, id, 'category');
  return {
    ...categoryActions(bo),
    addFeat: (categoryId, init) => {
      (categoryId === null ? bo : category(categoryId)).add(init);
    },
    renameFeat: (id, name) => attempt(() => feat(id).setName(name)),
    setFeatDescription: (id, description) => feat(id).setDescription(description),
    moveFeat: (id, categoryId) =>
      feat(id).moveTo(categoryId === null ? null : category(categoryId)),
    removeFeat: (id) => feat(id).remove(),
  };
}

function spellListActions(sheet: CharacterSheetBO): SpellListActions {
  const bo = sheet.spellList;
  const spell = (id: string) => itemById(bo, id, 'spell');
  const category = (id: string) => byId(bo.categories, id, 'category');
  return {
    ...categoryActions(bo),
    // `add` takes a name and a description only; level and prepared go through the added item's
    // own setters rather than being written into a literal this file builds.
    addSpell: (categoryId, init) => {
      const added = (categoryId === null ? bo : category(categoryId)).add(init);
      added.setLevel(init.level);
      added.setPrepared(init.prepared);
    },
    renameSpell: (id, name) => attempt(() => spell(id).setName(name)),
    setSpellDescription: (id, description) => spell(id).setDescription(description),
    setSpellLevel: (id, level) => spell(id).setLevel(level),
    setSpellPrepared: (id, prepared) => spell(id).setPrepared(prepared),
    moveSpell: (id, categoryId) =>
      spell(id).moveTo(categoryId === null ? null : category(categoryId)),
    removeSpell: (id) => spell(id).remove(),
  };
}

function countersActions(sheet: CharacterSheetBO): CountersActions {
  const bo = sheet.counters;
  const counter = (id: string) => itemById(bo, id, 'counter');
  const category = (id: string) => byId(bo.categories, id, 'category');
  // The nine slots are fixed and keyed by level, so there is no id here either.
  const slot = (level: number) => {
    const found = bo.spellSlots.find((entry) => entry.level === level);
    if (found === undefined) {
      throw new RuleViolation('GONE', `there is no level ${level} spell slot`);
    }
    return found;
  };
  return {
    ...categoryActions(bo),
    addCounter: (categoryId, init) => {
      // A new counter starts full: nobody creates "Rage 3" meaning none left.
      const added = (categoryId === null ? bo : category(categoryId)).add(init);
      added.setTotal(init.total);
      added.setCurrent(init.total);
    },
    renameCounter: (id, name) => attempt(() => counter(id).setName(name)),
    setCounterDescription: (id, description) => counter(id).setDescription(description),
    setCounterCurrent: (id, value) => counter(id).setCurrent(value),
    setCounterTotal: (id, value) => counter(id).setTotal(value),
    moveCounter: (id, categoryId) =>
      counter(id).moveTo(categoryId === null ? null : category(categoryId)),
    removeCounter: (id) => counter(id).remove(),
    setSpellSlotCurrent: (level, value) => slot(level).setCurrent(value),
    setSpellSlotTotal: (level, value) => slot(level).setTotal(value),
  };
}

function abilitiesActions(sheet: CharacterSheetBO): AbilitiesAndSkillsActions {
  const bo = sheet.abilitiesAndSkills;
  return {
    setProficiencyBonus: (value) => bo.setProficiencyBonus(value),
    setPassivePerception: (value) => bo.setPassivePerception(value),
    setSpeed: (value) => bo.setSpeed(value),
    setAbilityScore: (key, value) => bo.abilities[key].setScore(value),
    setAbilityModifier: (key, value) => bo.abilities[key].setModifier(value),
    setSavingThrowModifier: (key, value) => bo.abilities[key].setSavingThrowModifier(value),
    setSavingThrowProficient: (key, value) => bo.abilities[key].setSavingThrowProficient(value),
    setSkillModifier: (key, value) => bo.skills[key].setModifier(value),
    setSkillProficient: (key, value) => bo.skills[key].setProficient(value),
    setSkillExpertise: (key, value) => bo.skills[key].setExpertise(value),
  };
}

export function toSheetActions(sheet: CharacterSheetBO): SheetActions {
  return {
    vitals: vitalsActions(sheet),
    journalAndNotes: journalActions(sheet),
    inventory: inventoryActions(sheet),
    featsAndTraits: featsActions(sheet),
    equipment: equipmentActions(sheet),
    spellList: spellListActions(sheet),
    counters: countersActions(sheet),
    abilitiesAndSkills: abilitiesActions(sheet),
  };
}

// ---------------------------------------------------------------------------
// The character list and the persistence gate
// ---------------------------------------------------------------------------

/**
 * Every stored character as a row, damaged ones included and flagged (criterion 15).
 *
 * The id comes from the entry, which took it from the repository's summary — the store key the
 * row must be fetched back by — and not from a document this never opens. That is the point of a
 * summary: listing twenty characters must not parse twenty documents.
 */
export function toCharacterRows(library: CharacterLibraryBO): CharacterRow[] {
  return library.entries.map((entry) =>
    entry.isDamaged
      ? {
          ok: false,
          id: entry.id,
          // `problem` is null only when the row is healthy, which this branch has ruled out; the
          // fallback is here because a sentence is the row's only content and an empty one would
          // render a blank card.
          message: entry.problem ?? 'This character could not be read.',
        }
      : {
          ok: true,
          id: entry.id,
          name: entry.name,
          level: entry.totalLevel,
          updatedAt: entry.updatedAt ?? '',
          portrait: entry.portrait,
        },
  );
}

export interface StorageGateView {
  /** Whether the blocking dialog covers the list at all. */
  open: boolean;
  phase: 'ask' | 'refused';
  estimate?: { usage: number; quota: number };
}

/**
 * Four business states onto the dialog's two phases plus "not shown".
 *
 * `unknown` shows the gate in its `ask` phase and `denied` in `refused`, which is the whole of
 * criterion 13's distinction: before a request has been made there is nothing to explain, and
 * after one came back false there is. `granted` and `dismissedForSession` both close it —
 * the second only until the next launch, because `StorageGate` does not persist it.
 */
export function toStorageGateView(gate: StorageGate): StorageGateView {
  const usage = gate.usage;
  return {
    open: gate.persistence === 'unknown' || gate.persistence === 'denied',
    phase: gate.persistence === 'denied' ? 'refused' : 'ask',
    ...(usage === null ? {} : { estimate: usage }),
  };
}

// ---------------------------------------------------------------------------
// Keeping it live
// ---------------------------------------------------------------------------

/**
 * Re-renders whenever anything `compute` read changes.
 *
 * One `reaction` over a whole snapshot rather than an `observer` per component. That is coarse on
 * purpose: a character sheet is a few hundred values, and the alternative would put MobX into
 * every component in `screens/` and cost them their data-in/callbacks-out contract — the property
 * that lets a story be a literal.
 *
 * `fireImmediately` costs one extra render on mount and buys the window between the first
 * render's snapshot and the effect subscribing, in which a change would otherwise be missed.
 *
 * `compute` must be stable, so every caller below wraps it in `useCallback`. `mobx` is imported
 * here and nowhere else in `src/ui/`: this file is the layer seam, and that the state underneath
 * is observable is its business and no component's.
 */
export function useObserved<T>(compute: () => T): T {
  const [value, setValue] = useState(compute);
  useEffect(() => reaction(compute, setValue, { fireImmediately: true }), [compute]);
  return value;
}

export function useSheet(sheet: CharacterSheetBO): { data: SheetData; actions: SheetActions } {
  const data = useObserved(useCallback(() => toSheetData(sheet), [sheet]));
  const actions = useMemo(() => toSheetActions(sheet), [sheet]);
  return { data, actions };
}

/** The list rows, live: `create`, `add` and `remove` all push through `entries`. */
export function useCharacterRows(library: CharacterLibraryBO): CharacterRow[] {
  return useObserved(useCallback(() => toCharacterRows(library), [library]));
}

export function useStorageGate(gate: StorageGate): StorageGateView {
  return useObserved(useCallback(() => toStorageGateView(gate), [gate]));
}

/**
 * Separate from `useStorageGate` because the two are unrelated: the gate is about whether storage
 * can be evicted, a failure is about a write that has already gone wrong. They share a class only
 * because spec §5 put them there.
 */
export function useStorageFailure(gate: StorageGate): StorageFailure | null {
  return useObserved(useCallback(() => gate.failure, [gate]));
}

// ---------------------------------------------------------------------------
// Cloud backup
// ---------------------------------------------------------------------------

export function toCloudView(cloud: CloudBackup): CloudView {
  return {
    status: cloud.status,
    user: cloud.user && { name: cloud.user.name, email: cloud.user.email },
    characters: cloud.characters.flatMap(({ characterId, versions }) => {
      const newest = versions.find((version) => version.sheet !== null) ?? versions[0];
      if (newest === undefined) return [];
      return [
        {
          characterId,
          name: newest.sheet?.name ?? 'Unreadable character',
          level: newest.sheet?.totalLevel ?? 0,
          versions: versions.map((version) => ({
            uploadedAt: version.uploadedAt,
            sheetUpdatedAt: version.sheet?.sheetUpdatedAt ?? version.uploadedAt,
            name: version.sheet?.name ?? 'Unreadable character',
            level: version.sheet?.totalLevel ?? 0,
            bytes: version.bytes,
            fromNewerApp: version.fromNewerApp,
          })),
        },
      ];
    }),
    totalBytes: cloud.usedBytes,
    busy: cloud.busy,
  };
}

export function useCloud(cloud: CloudBackup): CloudView {
  return useObserved(useCallback(() => toCloudView(cloud), [cloud]));
}

/**
 * The sheet's line under its Upload button: the outcome of the last upload *of this character*,
 * including one resumed after a sign-in redirect. The time is formatted by the screen.
 */
export function useUploadNotice(
  cloud: CloudBackup,
  characterId: string,
): { ok: true; uploadedAt: string } | { ok: false; message: string } | null {
  return useObserved(
    useCallback(() => {
      const last = cloud.lastUpload;
      return last !== null && last.characterId === characterId ? last.result : null;
    }, [cloud, characterId]),
  );
}
