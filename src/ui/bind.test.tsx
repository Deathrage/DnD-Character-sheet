// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CharacterLibraryBO,
  StorageGate,
  createCharacterSheet,
  type CharacterSheetBO,
} from '../business/index.js';
import { ID_A, putRaw, wipe } from '../test/fixtures.js';
import {
  toCharacterRows,
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
    sheet.hitPoints.setTotal(45);
    sheet.hitPoints.setTemporary(5);
    sheet.hitDices.add(8).setTotal(5);
    sheet.hitDices.add(6);
    sheet.journalAndNotes.appendDay('Arrived in Barovia.');
    sheet.journalAndNotes.setNotes('Find the Sunsword.');
    sheet.inventory.coins.setGp(84);
    sheet.inventory.add({ name: 'Rope', description: '50 ft', count: 2 });
    sheet.equipment.addWeapon({ name: 'Rapier', equipped: true });
    sheet.equipment.addOther({ name: 'Cloak', attuned: true });
    sheet.featsAndTraits.createCategory('Rogue').add({ name: 'Sneak Attack', description: '+3d6' });
    sheet.featsAndTraits.add({ name: 'Darkvision' });
    const spell = sheet.spellList.createCategory('Combat').add({ name: 'Fireball' });
    spell.setLevel(3);
    spell.setPrepared(true);
    sheet.counters.add({ name: 'Inspiration' }).setTotal(1);
    sheet.counters.spellSlots[1]?.setTotal(2);
    sheet.counters.spellSlots[1]?.setCurrent(1);
    sheet.abilitiesAndSkills.setProficiencyBonus(3);
    sheet.abilitiesAndSkills.setPassivePerception(14);
    sheet.abilitiesAndSkills.setSpeed(30);
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
      },
    ]);
    expect(data.equipment.other.map((item) => item.name)).toEqual(['Cloak']);
    expect(data.equipment.attuned.map((item) => item.name)).toEqual(['Cloak']);
    expect(data.equipment.equipped.map((item) => item.name)).toEqual(['Rapier']);

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
    actions.equipment.addEquipment('weapons', {
      name: 'Rapier',
      description: '',
      attuned: false,
      equipped: true,
    });
    actions.equipment.addEquipment('other', {
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
    actions.counters.addCounter(null, { name: 'Inspiration', description: '', total: 1 });
    actions.counters.setSpellSlotTotal(2, 2);
    actions.counters.setSpellSlotCurrent(2, 1);
    actions.abilitiesAndSkills.setSpeed(30);
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
    expect(doc.equipment.weapons[0]).toMatchObject({ name: 'Rapier', equipped: true });
    expect(doc.equipment.other[0]).toMatchObject({ name: 'Cloak', attuned: true });
    expect(doc.featsAndTraits.categories[0]?.items[0]).toMatchObject({ name: 'Sneak Attack' });
    expect(doc.spellList.uncategorized[0]).toMatchObject({ level: 3, prepared: true });
    expect(doc.counters.uncategorized[0]).toMatchObject({ name: 'Inspiration', total: 1 });
    expect(doc.counters.spellSlots['2']).toEqual({ current: 1, total: 2 });
    expect(doc.abilitiesAndSkills.speed).toBe(30);
    expect(doc.abilitiesAndSkills.abilities.dexterity).toMatchObject({
      score: 17,
      savingThrowProficient: true,
    });
    expect(doc.abilitiesAndSkills.skills.stealth.expertise).toBe(true);
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
    actions.equipment.addEquipment('weapons', {
      name: 'Rapier',
      description: '',
      attuned: false,
      equipped: false,
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
    actions.featsAndTraits.renameCategory(featCategoryId, 'Rogue levels');
    actions.featsAndTraits.renameFeat(featId, 'Superior Darkvision');
    actions.featsAndTraits.setFeatDescription(featId, '120 ft');
    actions.spellList.renameSpell(spellId, 'Delayed Blast Fireball');
    actions.spellList.setSpellDescription(spellId, '12d6 fire');
    actions.spellList.setSpellLevel(spellId, 7);
    actions.spellList.setSpellPrepared(spellId, true);
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
    });
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
    actions.counters.removeCounter(counterId);

    const emptied = sheet.toDocument();
    expect(emptied.classes).toEqual([]);
    expect(emptied.hitDices).toEqual({});
    expect(emptied.journalAndNotes.journal).toEqual([]);
    expect(emptied.inventory.items).toEqual([]);
    expect(emptied.equipment.weapons).toEqual([]);
    expect(emptied.spellList.uncategorized).toEqual([]);
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
    // Autosave writes on the next macrotask (debounceMs 0), and `load()` re-reads the store —
    // so without settling first the row would be the blank one `create` saved.
    await new Promise((resolve) => setTimeout(resolve, 0));
    await library.load();

    expect(toCharacterRows(library)).toEqual([
      {
        ok: true,
        id: sheet.id,
        name: 'Sable',
        level: 5,
        classes: [{ name: 'Rogue', level: 5 }],
        hitPoints: { current: 38, total: 45, temporary: 0 },
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
