// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  CharacterLibraryBO,
  CloudBackup,
  StorageGate,
  createCharacterSheet,
  type CharacterSheetBO,
} from '../business/index.js';
import { ID_A, clock, putRaw, wipe } from '../test/fixtures.js';
import {
  toCharacterRows,
  toCloudView,
  toSheetActions,
  toSheetData,
  toStorageGateView,
  useCharacterRows,
  useSheet,
} from './bind.js';
import { CharacterList } from './screens/CharacterList.js';
import { CharacterHub } from './screens/CharacterHub.js';

/**
 * Both directions are asserted against the *document*, never view against action. A view that
 * read `total` where it means `current` and an action that wrote `total` where it means
 * `current` would agree with each other perfectly, and a test that only compared the two would
 * stay green — the shape of wrong-reason pass this repo keeps finding.
 */
const newSheet = (): CharacterSheetBO =>
  createCharacterSheet('Sable', new Date('2026-07-25T09:41:00.000Z'));

describe('toSheetData', () => {
  it('mirrors every section of a filled document', () => {
    const sheet = newSheet();
    sheet.setArmorClass(15);
    sheet.classes.add({ name: 'Rogue', level: 5 });
    sheet.classes.add({ name: 'Wizard', level: 2 });
    sheet.hitPoints.setCurrent(38);
    sheet.setPortrait('data:image/jpeg;base64,/9j/4AAQ');
    sheet.hitPoints.setTotal(45);
    sheet.hitPoints.setTemporary(5);
    sheet.hitDices.add(8).setTotal(5);
    sheet.hitDices.add(6);
    sheet.journalAndNotes.appendDay('Arrived in Barovia.');
    sheet.journalAndNotes.setNotes('Find the Sunsword.');
    sheet.inventory.coins.setGp(84);
    sheet.inventory.add({ name: 'Rope', description: '50 ft', count: 2 });
    sheet.equipment.addWeapon({
      name: 'Rapier',
      equipped: true,
      attack: { ability: 'dexterity', attackBonus: 6, damage: '1d8+3 piercing' },
    });
    sheet.equipment.addOther({ name: 'Cloak', attuned: true });
    sheet.featsAndTraits.createCategory('Rogue').add({ name: 'Sneak Attack', description: '+3d6' });
    sheet.featsAndTraits.add({ name: 'Darkvision' });
    const spell = sheet.spellList.createCategory('Combat').add({ name: 'Fireball' });
    spell.setLevel(3);
    spell.setPrepared(true);
    sheet.spellList.spellcasting.add('charisma', { attackBonus: 4, saveDc: 12 });
    sheet.spellList.spellcasting.add('intelligence', { attackBonus: 6, saveDc: 14 });
    sheet.counters.add({ name: 'Inspiration' }).setTotal(1);
    sheet.counters.spellSlots[1]?.setTotal(2);
    sheet.counters.spellSlots[1]?.setCurrent(1);
    sheet.abilitiesAndSkills.setProficiencyBonus(3);
    sheet.abilitiesAndSkills.setPassivePerception(14);
    sheet.abilitiesAndSkills.setSpeed(30);
    sheet.abilitiesAndSkills.setInitiative(5);
    sheet.abilitiesAndSkills.abilities.dexterity.setScore(17);
    sheet.abilitiesAndSkills.abilities.dexterity.setModifier(3);
    sheet.abilitiesAndSkills.abilities.dexterity.setSavingThrowModifier(6);
    sheet.abilitiesAndSkills.abilities.dexterity.setSavingThrowProficient(true);
    sheet.abilitiesAndSkills.skills.stealth.setModifier(9);
    sheet.abilitiesAndSkills.skills.stealth.setProficient(true);
    sheet.abilitiesAndSkills.skills.stealth.setExpertise(true);

    const data = toSheetData(sheet);
    const doc = sheet.toDocument();

    expect(data.character).toEqual({
      id: doc.id,
      name: 'Sable',
      // Derived, never stored: 5 + 2.
      level: 7,
      classes: [
        { id: doc.classes[0]?.id, name: 'Rogue', level: 5 },
        { id: doc.classes[1]?.id, name: 'Wizard', level: 2 },
      ],
      hitPoints: { current: 38, total: 45, temporary: 5 },
      // Ascending by size, which is `HitDicesBO.items`' order and not insertion order.
      hitDices: [
        { size: 6, current: 0, total: 0 },
        { size: 8, current: 0, total: 5 },
      ],
      armorClass: 15,
      speed: 30,
      initiative: 5,
      portrait: 'data:image/jpeg;base64,/9j/4AAQ',
    });

    expect(data.journalAndNotes).toEqual({
      days: ['Arrived in Barovia.'],
      notes: 'Find the Sunsword.',
    });

    expect(data.inventory.coins).toEqual({ pp: 0, gp: 84, ep: 0, sp: 0, cp: 0 });
    expect(data.inventory.items).toEqual([
      { id: doc.inventory.items[0]?.id, name: 'Rope', description: '50 ft', count: 2 },
    ]);

    expect(data.equipment.weapons).toEqual([
      {
        id: doc.equipment.weapons[0]?.id,
        name: 'Rapier',
        description: '',
        attuned: false,
        equipped: true,
        attack: doc.equipment.weapons[0]?.attack,
      },
    ]);
    expect(doc.equipment.weapons[0]?.attack).toEqual({
      ability: 'dexterity',
      attackBonus: 6,
      damage: '1d8+3 piercing',
    });
    // Other equipment has no attack in its view: only a weapon's view carries the key.
    expect(data.equipment.other).toEqual([
      {
        id: doc.equipment.other[0]?.id,
        name: 'Cloak',
        description: '',
        attuned: true,
        equipped: false,
      },
    ]);
    expect(data.equipment.attuned.map((item) => item.name)).toEqual(['Cloak']);
    // A weapon in a derived list keeps its attack, so the Equipped block can show it.
    expect(data.equipment.equipped).toEqual([data.equipment.weapons[0]]);

    expect(data.featsAndTraits).toEqual({
      categories: [
        {
          id: doc.featsAndTraits.categories[0]?.id,
          name: 'Rogue',
          items: [
            {
              id: doc.featsAndTraits.categories[0]?.items[0]?.id,
              name: 'Sneak Attack',
              description: '+3d6',
            },
          ],
        },
      ],
      uncategorized: [
        { id: doc.featsAndTraits.uncategorized[0]?.id, name: 'Darkvision', description: '' },
      ],
    });

    expect(data.spellList.categories[0]?.items[0]).toEqual({
      id: doc.spellList.categories[0]?.items[0]?.id,
      name: 'Fireball',
      description: '',
      level: 3,
      prepared: true,
    });
    // STR to CHA, whatever order they were added in; read against the document, not the view.
    expect(doc.spellList.spellcasting).toEqual({
      intelligence: { attackBonus: 6, saveDc: 14 },
      charisma: { attackBonus: 4, saveDc: 12 },
    });
    expect(data.spellList.spellcasting).toEqual([
      { ability: 'intelligence', attackBonus: 6, saveDc: 14 },
      { ability: 'charisma', attackBonus: 4, saveDc: 12 },
    ]);

    expect(data.counters.uncategorized).toEqual([
      {
        id: doc.counters.uncategorized[0]?.id,
        name: 'Inspiration',
        description: '',
        current: 0,
        total: 1,
      },
    ]);
    expect(data.counters.spellSlots).toHaveLength(9);
    expect(data.counters.spellSlots[1]).toEqual({ level: 2, current: 1, total: 2 });

    expect(data.abilitiesAndSkills.proficiencyBonus).toBe(3);
    expect(data.abilitiesAndSkills.passivePerception).toBe(14);
    expect(data.abilitiesAndSkills.speed).toBe(30);
    expect(data.abilitiesAndSkills.initiative).toBe(5);
    expect(data.abilitiesAndSkills.abilities.dexterity).toEqual({
      score: 17,
      modifier: 3,
      savingThrowModifier: 6,
      savingThrowProficient: true,
    });
    expect(data.abilitiesAndSkills.skills.stealth).toEqual({
      modifier: 9,
      proficient: true,
      expertise: true,
    });
    // All six and all eighteen, so a missing key is a failure rather than a gap.
    expect(Object.keys(data.abilitiesAndSkills.abilities)).toHaveLength(6);
    expect(Object.keys(data.abilitiesAndSkills.skills)).toHaveLength(18);
  });

  it('orders spells by level within each bucket, cantrips first, leaving the document alone', () => {
    const sheet = newSheet();
    const combat = sheet.spellList.createCategory('Combat');
    combat.add({ name: 'Fireball' }).setLevel(3);
    combat.add({ name: 'Fire Bolt' }).setLevel('c');
    combat.add({ name: 'Magic Missile' }).setLevel(1);
    combat.add({ name: 'Ray of Frost' }).setLevel('c');
    sheet.spellList.add({ name: 'Counterspell' }).setLevel(3);
    sheet.spellList.add({ name: 'Light' }).setLevel('c');

    const data = toSheetData(sheet).spellList;
    // Ray of Frost after Fire Bolt: equal levels keep the order they were added in.
    expect(data.categories[0]?.items.map((spell) => spell.name)).toEqual([
      'Fire Bolt',
      'Ray of Frost',
      'Magic Missile',
      'Fireball',
    ]);
    expect(data.uncategorized.map((spell) => spell.name)).toEqual(['Light', 'Counterspell']);
    expect(sheet.toDocument().spellList.uncategorized.map((spell) => spell.name)).toEqual([
      'Counterspell',
      'Light',
    ]);
  });
});

describe('toSheetActions', () => {
  it('writes every section through to the document', () => {
    const sheet = newSheet();
    const actions = toSheetActions(sheet);

    actions.vitals.setCurrentHitPoints(38);
    actions.vitals.setTotalHitPoints(45);
    actions.vitals.setTemporaryHitPoints(5);
    actions.vitals.setArmorClass(15);
    actions.vitals.addClass('Rogue');
    actions.vitals.addHitDie(8);
    actions.vitals.setHitDieTotal(8, 5);
    actions.vitals.setHitDieCurrent(8, 3);
    actions.journalAndNotes.appendDay();
    actions.journalAndNotes.setDayText(0, 'Arrived in Barovia.');
    actions.journalAndNotes.setNotes('Find the Sunsword.');
    actions.inventory.setCoin('gp', 84);
    actions.inventory.addItem({ name: 'Rope', description: '50 ft', count: 2 });
    actions.equipment.addWeapon({
      name: 'Rapier',
      description: '',
      attuned: false,
      equipped: true,
      attack: { ability: 'dexterity', attackBonus: 6, damage: '1d8+3 piercing' },
    });
    actions.equipment.addOther({
      name: 'Cloak',
      description: '',
      attuned: true,
      equipped: false,
    });
    actions.featsAndTraits.createCategory('Rogue');
    actions.spellList.addSpell(null, {
      name: 'Fireball',
      description: 'A ball of fire.',
      level: 3,
      prepared: true,
    });
    actions.spellList.addSpellcasting('wisdom', { attackBonus: 5, saveDc: 13 });
    actions.counters.addCounter(null, { name: 'Inspiration', description: '', total: 1 });
    actions.counters.setSpellSlotTotal(2, 2);
    actions.counters.setSpellSlotCurrent(2, 1);
    actions.abilitiesAndSkills.setSpeed(30);
    actions.abilitiesAndSkills.setInitiative(-1);
    actions.abilitiesAndSkills.setAbilityScore('dexterity', 17);
    actions.abilitiesAndSkills.setSavingThrowProficient('dexterity', true);
    actions.abilitiesAndSkills.setSkillExpertise('stealth', true);

    const categoryId = toSheetData(sheet).featsAndTraits.categories[0]?.id ?? '';
    actions.featsAndTraits.addFeat(categoryId, { name: 'Sneak Attack', description: '+3d6' });

    const doc = sheet.toDocument();
    expect(doc.hitPoints).toEqual({ current: 38, total: 45, temporary: 5 });
    expect(doc.armorClass).toBe(15);
    expect(doc.classes.map((entry) => entry.name)).toEqual(['Rogue']);
    expect(doc.hitDices).toEqual({ '8': { current: 3, total: 5 } });
    expect(doc.journalAndNotes).toEqual({
      journal: ['Arrived in Barovia.'],
      notes: 'Find the Sunsword.',
    });
    expect(doc.inventory.coins.gp).toBe(84);
    expect(doc.inventory.items[0]).toMatchObject({ name: 'Rope', description: '50 ft', count: 2 });
    expect(doc.equipment.weapons[0]).toMatchObject({
      name: 'Rapier',
      equipped: true,
      attack: { ability: 'dexterity', attackBonus: 6, damage: '1d8+3 piercing' },
    });
    expect(doc.equipment.other[0]).toMatchObject({ name: 'Cloak', attuned: true });
    expect(doc.featsAndTraits.categories[0]?.items[0]).toMatchObject({ name: 'Sneak Attack' });
    expect(doc.spellList.uncategorized[0]).toMatchObject({ level: 3, prepared: true });
    expect(doc.spellList.spellcasting).toEqual({ wisdom: { attackBonus: 5, saveDc: 13 } });
    expect(doc.counters.uncategorized[0]).toMatchObject({
      name: 'Inspiration',
      current: 1,
      total: 1,
    });
    expect(doc.counters.spellSlots['2']).toEqual({ current: 1, total: 2 });
    expect(doc.abilitiesAndSkills.speed).toBe(30);
    expect(doc.abilitiesAndSkills.initiative).toBe(-1);
    expect(doc.abilitiesAndSkills.abilities.dexterity).toMatchObject({
      score: 17,
      savingThrowProficient: true,
    });
    expect(doc.abilitiesAndSkills.skills.stealth.expertise).toBe(true);
  });

  it('returns a message for over-long damage instead of throwing, and None clears the attack', () => {
    const sheet = newSheet();
    const actions = toSheetActions(sheet);
    actions.equipment.addWeapon({
      name: 'Rapier',
      description: '',
      attuned: false,
      equipped: false,
      attack: { ability: 'dexterity', attackBonus: 6, damage: '1d8' },
    });
    const id = toSheetData(sheet).equipment.weapons[0]?.id ?? '';

    expect(actions.equipment.setWeaponAttackDamage(id, 'x'.repeat(81))).toMatch(/80/);
    expect(sheet.toDocument().equipment.weapons[0]?.attack?.damage).toBe('1d8');

    actions.equipment.setWeaponAttackAbility(id, null);
    expect(sheet.toDocument().equipment.weapons[0]?.attack).toBeNull();
  });

  it("sets speed from the header, into the abilities section's field", () => {
    const sheet = newSheet();
    toSheetActions(sheet).vitals.setSpeed(25);
    expect(sheet.toDocument().abilitiesAndSkills.speed).toBe(25);
  });

  it("sets initiative from the header, into the abilities section's field", () => {
    const sheet = newSheet();
    toSheetActions(sheet).vitals.setInitiative(-2);
    expect(sheet.toDocument().abilitiesAndSkills.initiative).toBe(-2);
  });

  /**
   * The add-everything test above proves each action reaches its section. It does not prove the
   * edit-an-existing-thing setters reach the right *field*: writing `setCounterCurrent` through
   * to `total` survived it. Every value below is distinct for that reason — a setter aimed one
   * field over lands on a number that is not the one asserted.
   */
  it('edits an existing item through each by-id setter', () => {
    const sheet = newSheet();
    const actions = toSheetActions(sheet);
    actions.vitals.addClass('Rogue');
    actions.vitals.addHitDie(8);
    actions.journalAndNotes.appendDay();
    actions.inventory.addItem({ name: 'Rope', description: '', count: 1 });
    actions.equipment.addWeapon({
      name: 'Rapier',
      description: '',
      attuned: false,
      equipped: false,
      attack: null,
    });
    actions.featsAndTraits.createCategory('Rogue');
    actions.featsAndTraits.addFeat(null, { name: 'Darkvision', description: '' });
    actions.spellList.addSpell(null, {
      name: 'Fireball',
      description: '',
      level: 'c',
      prepared: false,
    });
    actions.counters.addCounter(null, { name: 'Inspiration', description: '', total: 0 });
    actions.spellList.addSpellcasting('intelligence', { attackBonus: 1, saveDc: 2 });

    const before = toSheetData(sheet);
    const classId = before.character.classes[0]?.id ?? '';
    const itemId = before.inventory.items[0]?.id ?? '';
    const gearId = before.equipment.weapons[0]?.id ?? '';
    const featCategoryId = before.featsAndTraits.categories[0]?.id ?? '';
    const featId = before.featsAndTraits.uncategorized[0]?.id ?? '';
    const spellId = before.spellList.uncategorized[0]?.id ?? '';
    const counterId = before.counters.uncategorized[0]?.id ?? '';

    actions.vitals.setClassLevel(classId, 5);
    actions.inventory.renameItem(itemId, 'Silk Rope');
    actions.inventory.setItemDescription(itemId, '50 ft');
    actions.inventory.setItemCount(itemId, 2);
    actions.equipment.renameEquipment(gearId, 'Rapier +1');
    actions.equipment.setEquipmentDescription(gearId, '1d8 piercing');
    actions.equipment.setAttuned(gearId, true);
    actions.equipment.setEquipped(gearId, true);
    actions.equipment.setWeaponAttackAbility(gearId, 'strength');
    actions.equipment.setWeaponAttackBonus(gearId, 7);
    const damageFailure = actions.equipment.setWeaponAttackDamage(gearId, '2d6+4 slashing');
    actions.equipment.setWeaponAttackAbility(gearId, 'dexterity');
    actions.featsAndTraits.renameCategory(featCategoryId, 'Rogue levels');
    actions.featsAndTraits.renameFeat(featId, 'Superior Darkvision');
    actions.featsAndTraits.setFeatDescription(featId, '120 ft');
    actions.spellList.renameSpell(spellId, 'Delayed Blast Fireball');
    actions.spellList.setSpellDescription(spellId, '12d6 fire');
    actions.spellList.setSpellLevel(spellId, 7);
    actions.spellList.setSpellPrepared(spellId, true);
    actions.spellList.setSpellAttackBonus('intelligence', 6);
    actions.spellList.setSpellSaveDc('intelligence', 14);
    actions.counters.renameCounter(counterId, 'Bardic Inspiration');
    actions.counters.setCounterDescription(counterId, 'd8, regained on a rest');
    actions.counters.setCounterTotal(counterId, 4);
    actions.counters.setCounterCurrent(counterId, 3);
    actions.abilitiesAndSkills.setProficiencyBonus(3);
    actions.abilitiesAndSkills.setPassivePerception(14);
    actions.abilitiesAndSkills.setAbilityModifier('wisdom', 1);
    actions.abilitiesAndSkills.setSavingThrowModifier('wisdom', 4);
    actions.abilitiesAndSkills.setSkillModifier('perception', 7);
    actions.abilitiesAndSkills.setSkillProficient('perception', true);

    const doc = sheet.toDocument();
    expect(doc.classes[0]).toMatchObject({ name: 'Rogue', level: 5 });
    expect(doc.inventory.items[0]).toMatchObject({
      name: 'Silk Rope',
      description: '50 ft',
      count: 2,
    });
    expect(doc.equipment.weapons[0]).toMatchObject({
      name: 'Rapier +1',
      description: '1d8 piercing',
      attuned: true,
      equipped: true,
      attack: { ability: 'dexterity', attackBonus: 7, damage: '2d6+4 slashing' },
    });
    expect(damageFailure).toBeNull();
    expect(doc.featsAndTraits.categories[0]?.name).toBe('Rogue levels');
    expect(doc.featsAndTraits.uncategorized[0]).toMatchObject({
      name: 'Superior Darkvision',
      description: '120 ft',
    });
    expect(doc.spellList.uncategorized[0]).toMatchObject({
      name: 'Delayed Blast Fireball',
      description: '12d6 fire',
      level: 7,
      prepared: true,
    });
    expect(doc.spellList.spellcasting).toEqual({ intelligence: { attackBonus: 6, saveDc: 14 } });
    expect(doc.counters.uncategorized[0]).toMatchObject({
      name: 'Bardic Inspiration',
      description: 'd8, regained on a rest',
      current: 3,
      total: 4,
    });
    expect(doc.abilitiesAndSkills).toMatchObject({
      proficiencyBonus: 3,
      passivePerception: 14,
    });
    expect(doc.abilitiesAndSkills.abilities.wisdom).toMatchObject({
      modifier: 1,
      savingThrowModifier: 4,
    });
    expect(doc.abilitiesAndSkills.skills.perception).toMatchObject({
      modifier: 7,
      proficient: true,
    });

    // The removals, last, so everything above was asserted while it was still there.
    actions.vitals.removeClass(classId);
    actions.vitals.removeHitDie(8);
    actions.journalAndNotes.deleteNewestDay();
    actions.inventory.removeItem(itemId);
    actions.equipment.removeEquipment(gearId);
    actions.spellList.removeSpell(spellId);
    actions.spellList.removeSpellcasting('intelligence');
    actions.counters.removeCounter(counterId);

    const emptied = sheet.toDocument();
    expect(emptied.classes).toEqual([]);
    expect(emptied.hitDices).toEqual({});
    expect(emptied.journalAndNotes.journal).toEqual([]);
    expect(emptied.inventory.items).toEqual([]);
    expect(emptied.equipment.weapons).toEqual([]);
    expect(emptied.spellList.uncategorized).toEqual([]);
    expect(emptied.spellList.spellcasting).toEqual({});
    expect(emptied.counters.uncategorized).toEqual([]);
  });

  it('moves and removes a categorized item by id', () => {
    const sheet = newSheet();
    const actions = toSheetActions(sheet);
    actions.featsAndTraits.createCategory('Rogue');
    actions.featsAndTraits.addFeat(null, { name: 'Darkvision', description: '' });
    actions.featsAndTraits.addFeat(null, { name: 'Lucky', description: '' });

    const before = toSheetData(sheet).featsAndTraits;
    const categoryId = before.categories[0]?.id ?? '';
    const darkvision = before.uncategorized[0]?.id ?? '';
    const lucky = before.uncategorized[1]?.id ?? '';

    actions.featsAndTraits.moveFeat(darkvision, categoryId);
    actions.featsAndTraits.removeFeat(lucky);

    const doc = sheet.toDocument();
    expect(doc.featsAndTraits.categories[0]?.items.map((item) => item.name)).toEqual([
      'Darkvision',
    ]);
    expect(doc.featsAndTraits.uncategorized).toEqual([]);

    // Removing the category rehomes its items rather than taking them with it.
    actions.featsAndTraits.removeCategory(categoryId);
    expect(sheet.toDocument().featsAndTraits.uncategorized.map((item) => item.name)).toEqual([
      'Darkvision',
    ]);
  });

  /**
   * `moveSpell` and `moveCounter` are separate lines from `moveFeat`, and each resolves its
   * destination against its own section — a line that reached for the wrong section's category
   * would throw `UNKNOWN_CATEGORY` here and nowhere else.
   */
  it('moves a spell and a counter into their own section categories', () => {
    const sheet = newSheet();
    const actions = toSheetActions(sheet);
    actions.spellList.createCategory('Combat');
    actions.spellList.addSpell(null, {
      name: 'Fireball',
      description: '',
      level: 3,
      prepared: true,
    });
    actions.counters.createCategory('Class features');
    actions.counters.addCounter(null, { name: 'Rage', description: '', total: 3 });

    const before = toSheetData(sheet);
    actions.spellList.moveSpell(
      before.spellList.uncategorized[0]?.id ?? '',
      before.spellList.categories[0]?.id ?? '',
    );
    actions.counters.moveCounter(
      before.counters.uncategorized[0]?.id ?? '',
      before.counters.categories[0]?.id ?? '',
    );

    const doc = sheet.toDocument();
    expect(doc.spellList.categories[0]?.items.map((item) => item.name)).toEqual(['Fireball']);
    expect(doc.spellList.uncategorized).toEqual([]);
    expect(doc.counters.categories[0]?.items.map((item) => item.name)).toEqual(['Rage']);
    expect(doc.counters.uncategorized).toEqual([]);
  });

  it('returns the message for a rule the player provoked, and does not write', () => {
    const sheet = newSheet();
    const actions = toSheetActions(sheet);
    actions.vitals.addClass('Rogue');
    actions.vitals.addHitDie(8);
    actions.featsAndTraits.createCategory('Rogue');

    expect(actions.vitals.addClass('Rogue')).toMatch(/already exists/);
    expect(actions.vitals.addClass('   ')).toMatch(/must not be empty/);
    expect(actions.vitals.addClass('x'.repeat(81))).toMatch(/at most 80/);
    expect(actions.vitals.addHitDie(8)).toMatch(/already present/);
    expect(actions.vitals.addHitDie(0)).toMatch(/die size/);
    expect(actions.featsAndTraits.createCategory('Rogue')).toMatch(/already exists/);

    const doc = sheet.toDocument();
    expect(doc.classes).toHaveLength(1);
    expect(Object.keys(doc.hitDices)).toEqual(['8']);
    expect(doc.featsAndTraits.categories).toHaveLength(1);
  });

  it('renames the character, and reports a blank name instead of storing it', () => {
    const sheet = newSheet();
    const actions = toSheetActions(sheet);

    expect(actions.vitals.renameCharacter('  Wren  ')).toBeNull();
    expect(actions.vitals.renameCharacter('   ')).toMatch(/must not be empty/);
    expect(sheet.toDocument().name).toBe('Wren');
  });

  it('accepts a rename back to the item own name', () => {
    const sheet = newSheet();
    const actions = toSheetActions(sheet);
    actions.vitals.addClass('Rogue');
    const id = toSheetData(sheet).character.classes[0]?.id ?? '';

    expect(actions.vitals.renameClass(id, 'Rogue')).toBeNull();
  });

  it('rethrows a rule that means the caller is wrong', () => {
    const sheet = newSheet();
    const actions = toSheetActions(sheet);

    // An id that is not in the document: a view and the document out of step, not a typo.
    expect(() => actions.vitals.renameClass('nope', 'Rogue')).toThrow(/no class with id nope/);
    expect(() => actions.featsAndTraits.removeFeat('nope')).toThrow(/no feat with id nope/);
    expect(() => actions.vitals.setHitDieCurrent(8, 1)).toThrow(/no d8/);
    expect(() => actions.journalAndNotes.setDayText(0, 'x')).toThrow(/journal day 0/);
    // A non-integer is a UI bug the guards exist to catch; it must not read as a field message.
    expect(() => actions.vitals.setArmorClass(1.5)).toThrow(/expected an integer/);
  });
});

describe('useSheet', () => {
  const Harness = ({ sheet }: { sheet: CharacterSheetBO }) => {
    const { data, actions } = useSheet(sheet);
    return (
      <CharacterHub
        data={data}
        actions={actions}
        section={null}
        onSectionChange={() => {}}
        onBack={() => {}}
        onExport={() => {}}
        onOpenRawJson={() => {}}
      />
    );
  };

  const currentHitPoints = () =>
    (screen.getByLabelText('Current hit points') as HTMLInputElement).value;

  it('completes the loop: a tap reaches the document and the document reaches the screen', () => {
    const sheet = newSheet();
    sheet.hitPoints.setTotal(45);
    sheet.hitPoints.setCurrent(38);
    render(<Harness sheet={sheet} />);
    expect(currentHitPoints()).toBe('38');

    fireEvent.click(screen.getByLabelText('Decrease Current hit points'));

    expect(sheet.toDocument().hitPoints.current).toBe(37);
    expect(currentHitPoints()).toBe('37');
  });

  it('re-renders when the document changes without the UI touching it', () => {
    const sheet = newSheet();
    sheet.hitPoints.setTotal(45);
    sheet.hitPoints.setCurrent(38);
    render(<Harness sheet={sheet} />);

    // Autosave-restore, an import, the raw-JSON editor: not every write comes from a tap.
    act(() => {
      sheet.hitPoints.setCurrent(21);
    });

    expect(currentHitPoints()).toBe('21');
  });
});

describe('toCharacterRows', () => {
  beforeEach(wipe);
  afterEach(wipe);

  const newLibrary = () =>
    new CharacterLibraryBO({
      storageGate: new StorageGate({ port: null }),
      autosave: { debounceMs: 0, target: null },
    });

  it('maps a healthy character to an openable row', async () => {
    const library = newLibrary();
    const sheet = await library.create('Sable');
    sheet.classes.add({ name: 'Rogue', level: 5 });
    sheet.hitPoints.setTotal(45);
    sheet.hitPoints.setCurrent(38);
    sheet.setPortrait('data:image/jpeg;base64,/9j/4AAQ');
    // `load()` re-reads the store, so without flushing first the row would be the blank one
    // `create` saved. `flush()` rather than a settle: the portrait is written on its own path,
    // and flush is what waits for both writes to have landed.
    await library.flush();
    await library.load();

    expect(toCharacterRows(library)).toEqual([
      {
        ok: true,
        id: sheet.id,
        name: 'Sable',
        level: 5,
        // Stamped by autosave with the real clock, so only its shape is fixed.
        updatedAt: expect.stringMatching(/^\d{4}-\d\d-\d\dT/) as unknown as string,
        portrait: 'data:image/jpeg;base64,/9j/4AAQ',
      },
    ]);
  });

  it('maps a damaged character to a flagged row carrying the reason', async () => {
    await putRaw(ID_A, { schemaVersion: 99, id: ID_A });
    const library = newLibrary();
    await library.load();

    // Criterion 15: it is in the list, and the row says why rather than saying nothing.
    expect(toCharacterRows(library)).toEqual([
      { ok: false, id: ID_A, message: expect.stringMatching(/newer version/) as unknown as string },
    ]);
  });

  it('re-renders the list when a character is created', async () => {
    const library = newLibrary();
    await library.load();

    function Harness() {
      const rows = useCharacterRows(library);
      return (
        <CharacterList
          rows={rows}
          onOpen={() => {}}
          onOpenRawJson={() => {}}
          onCreate={() => {}}
          onImport={() => {}}
          onClone={() => {}}
          onDelete={() => {}}
        />
      );
    }

    render(<Harness />);
    expect(screen.getByText('No characters yet. Tap + to make one.')).toBeDefined();

    await act(async () => {
      await library.create('Sable');
    });

    expect(screen.getByText('Sable')).toBeDefined();
    expect(screen.getByText('1 saved')).toBeDefined();
  });
});

describe('toStorageGateView', () => {
  const gateWith = async (persisted: boolean, requested: boolean, dismissed = false) => {
    const gate = new StorageGate({
      port: { persisted: () => Promise.resolve(persisted), persist: () => Promise.resolve(false) },
    });
    await gate.load();
    if (requested) await gate.requestPersist();
    if (dismissed) gate.dismissForSession();
    return gate;
  };

  it('asks before a request has been made', async () => {
    expect(toStorageGateView(await gateWith(false, false))).toEqual({ open: true, phase: 'ask' });
  });

  it('explains a refusal once one has come back', async () => {
    expect(toStorageGateView(await gateWith(false, true))).toEqual({
      open: true,
      phase: 'refused',
    });
  });

  it('closes for good on a grant', async () => {
    expect(toStorageGateView(await gateWith(true, false))).toEqual({ open: false, phase: 'ask' });
  });

  it('closes for the session on a dismissal', async () => {
    expect(toStorageGateView(await gateWith(false, true, true))).toEqual({
      open: false,
      phase: 'ask',
    });
  });

  it('passes an estimate through when the engine has one, and omits it otherwise', async () => {
    const withEstimate = new StorageGate({
      port: {
        persisted: () => Promise.resolve(false),
        persist: () => Promise.resolve(false),
        estimate: () => Promise.resolve({ usage: 1024, quota: 8192 }),
      },
    });
    await withEstimate.load();
    expect(toStorageGateView(withEstimate).estimate).toEqual({ usage: 1024, quota: 8192 });

    // Absent, not `undefined` under a present key: `exactOptionalPropertyTypes` is on, and the
    // dialog's prop is optional.
    expect('estimate' in toStorageGateView(await gateWith(false, false))).toBe(false);
  });
});

describe('toCloudView', () => {
  /** What each test opened: flushed, then disposed, before the wipe, so no autosave outlives it. */
  let libraries: CharacterLibraryBO[] = [];
  let sheets: CharacterSheetBO[] = [];
  beforeEach(wipe);
  afterEach(async () => {
    await Promise.all(libraries.map((library) => library.flush()));
    for (const sheet of sheets) sheet.dispose();
    libraries = [];
    sheets = [];
    await wipe();
  });

  // jsdom's `Blob` does not implement `.stream()`, which `encodePayload`/`decodePayload` (real
  // code these tests deliberately run, not a stub) both call. Node's own `Blob` does, and is
  // otherwise identical, so it stands in for jsdom's only where these tests need the real
  // gzip round trip — restored after, so no other test in this jsdom file is affected.
  let realBlob: typeof Blob;
  beforeAll(async () => {
    realBlob = globalThis.Blob;
    globalThis.Blob = (await import('node:buffer')).Blob as unknown as typeof Blob;
  });
  afterAll(() => {
    globalThis.Blob = realBlob;
  });

  const USER = {
    uid: 'u1',
    name: 'Ja',
    email: 'ja@example.com',
    photoUrl: 'https://lh3.googleusercontent.com/a/ja',
  };

  const newLibrary = () => {
    const library = new CharacterLibraryBO({
      storageGate: new StorageGate({ port: null }),
      autosave: { debounceMs: 0, target: null },
    });
    libraries.push(library);
    return library;
  };
  const create = async (library: CharacterLibraryBO, name: string) => {
    const sheet = await library.create(name);
    sheets.push(sheet);
    return sheet;
  };

  interface FakeVersion {
    sheet: Uint8Array<ArrayBuffer>;
    portrait: string | null;
  }

  /**
   * Just enough of `CloudRepository` to drive a real `CloudBackup` through `upload` and
   * `refresh`, rather than asserting `toCloudView` against a hand-built `CloudView` — which is
   * what left this mapping untested: every `CloudScreen` test starts from a literal view, so
   * nothing failed if the "newest readable version" lookup were replaced by `versions[0]`, or
   * `problem`/`usedBytes`/`limitBytes` stopped passing through.
   */
  function fakeCloud() {
    let doc: { layoutVersion: 2; characters: Record<string, Record<string, FakeVersion>> } = {
      layoutVersion: 2,
      characters: {},
    };
    const write = (characterId: string, uploadedAt: string, version: FakeVersion) => {
      doc = {
        ...doc,
        characters: {
          ...doc.characters,
          [characterId]: { ...(doc.characters[characterId] ?? {}), [uploadedAt]: version },
        },
      };
    };
    const repository = {
      currentUser: async () => USER,
      signIn: async () => USER,
      signOut: async () => {},
      load: async () => ({ ok: true as const, doc }),
      // No portrait is ever attached in these tests, so `version.portrait` is always `null` —
      // the one case where `NewVersion`'s shape and the stored `CloudVersionData`'s coincide.
      upload: async (
        _uid: string,
        characterId: string,
        uploadedAt: string,
        version: { sheet: Uint8Array },
      ) =>
        // The real `sheet` is always a plain `ArrayBuffer`-backed view (never a
        // `SharedArrayBuffer`, which is all this narrows out); `encodePayload` builds it from a
        // `Response#arrayBuffer()`.
        write(characterId, uploadedAt, {
          sheet: version.sheet as Uint8Array<ArrayBuffer>,
          portrait: null,
        }),
      deleteVersions: async () => ({ ok: true as const, doc }),
    };
    return {
      repository,
      /** Writes a version's raw bytes directly, bypassing `upload` — a corrupt one, here. */
      plant: (characterId: string, uploadedAt: string, sheet: Uint8Array<ArrayBuffer>) =>
        write(characterId, uploadedAt, { sheet, portrait: null }),
    };
  }

  it("carries the account's name, email and picture into the view", async () => {
    const backup = new CloudBackup(newLibrary(), { load: async () => fakeCloud().repository });

    await backup.refresh();

    expect(toCloudView(backup).user).toEqual({
      name: 'Ja',
      email: 'ja@example.com',
      photoUrl: 'https://lh3.googleusercontent.com/a/ja',
    });
  });

  it('names the card by the newest readable version, and flags the unreadable one with its reason', async () => {
    const library = newLibrary();
    const sheet = await create(library, 'Sable');
    sheet.classes.add({ name: 'Rogue', level: 5 });
    await library.flush();
    const cloud = fakeCloud();
    const backup = new CloudBackup(library, {
      load: async () => cloud.repository,
      now: clock(),
    });

    const uploaded = await backup.upload(sheet.id);
    if (!uploaded.ok) throw new Error(uploaded.message);
    // Later than the upload, so it sorts first: the newest version is the unreadable one.
    cloud.plant(sheet.id, '2026-09-25T00:00:00.000Z', new Uint8Array([1, 2, 3]));
    await backup.refresh();

    const character = toCloudView(backup).characters[0]!;
    expect(character.name).toBe('Sable');
    expect(character.level).toBe(5);
    const [newest, older] = character.versions;
    expect(newest).toMatchObject({ name: null, level: null, sheetUpdatedAt: null });
    expect(newest?.problem).toMatch(/damaged/);
    expect(older).toMatchObject({ name: 'Sable', level: 5, problem: null });
    expect(older?.sheetUpdatedAt).not.toBeNull();
  });

  it('leaves the card unreadable when no version can be read', async () => {
    const cloud = fakeCloud();
    cloud.plant('c1', '2026-09-25T00:00:00.000Z', new Uint8Array([1, 2, 3]));
    const backup = new CloudBackup(newLibrary(), { load: async () => cloud.repository });

    await backup.refresh();

    const character = toCloudView(backup).characters[0]!;
    expect(character.name).toBeNull();
    expect(character.level).toBeNull();
  });

  it('passes usage and the limit straight through from the CloudBackup', async () => {
    const library = newLibrary();
    const sheet = await create(library, 'Sable');
    await library.flush();
    const cloud = fakeCloud();
    const backup = new CloudBackup(library, {
      load: async () => cloud.repository,
      now: clock(),
    });

    const uploaded = await backup.upload(sheet.id);
    if (!uploaded.ok) throw new Error(uploaded.message);
    await backup.refresh();

    const view = toCloudView(backup);
    expect(view.usedBytes).toBe(backup.usedBytes);
    expect(view.limitBytes).toBe(1_048_576);
  });
});
