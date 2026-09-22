import type {
  AbilityBO,
  CharacterLibraryBO,
  CharacterSheetBO,
  CounterBO,
  SkillBO,
  SpellBO,
  SpellLevel,
} from './business/index.js';

/**
 * Sample characters for `npm run dev`, so the app has something in it to look at.
 *
 * Dev only. `main.tsx` reaches this behind `import.meta.env.DEV`, which Vite replaces with a
 * literal `false` in a production build, so the whole import is dead code and never ships.
 *
 * It seeds **only when the store is empty**, which is what keeps it from fighting you: anything
 * you create, edit or delete survives a reload, and the seed does not come back. To get it back,
 * delete every character — or clear the site's storage in devtools.
 *
 * Everything below goes through the same business API the UI uses. Nothing here knows the shape of
 * a stored document, so this cannot drift into a second, private definition of what a character
 * is — if a rule changes, this file stops compiling or starts throwing, exactly like a component
 * would.
 */
export async function seedIfEmpty(library: CharacterLibraryBO): Promise<void> {
  await library.load();
  if (library.entries.length > 0) return;

  const sheets = [seedSable, seedThorne, seedWren];
  for (const fill of sheets) {
    const sheet = await library.create(fill.characterName);
    fill(sheet);
  }

  // Everything after `create` was an ordinary edit, so it is sitting in autosave's debounce
  // window. Flushing before the app renders means a reload two seconds later finds the whole
  // seed rather than three blank characters — and a half-seeded store would never re-seed,
  // because it is no longer empty.
  await library.flush();

  console.info(
    `[dev] Seeded ${String(sheets.length)} sample characters. Delete them all (or clear site data) to seed again.`,
  );
}

/**
 * Deletes every character, then seeds again. The dev button's whole implementation.
 *
 * `library.entries` hands back a copy, so removing while iterating it is safe — and each
 * `remove()` is the ordinary business one, which deletes the document and drops the row, so this
 * leaves the store in exactly the state a first run would.
 */
export async function reseed(library: CharacterLibraryBO): Promise<void> {
  await library.load();
  for (const entry of library.entries) {
    await entry.remove();
  }
  await seedIfEmpty(library);
}

type Seeder = ((sheet: CharacterSheetBO) => void) & { characterName: string };

const seeder = (characterName: string, fill: (sheet: CharacterSheetBO) => void): Seeder =>
  Object.assign(fill, { characterName });

/** The wireframe's own sample character, filled in far enough to exercise all seven sections. */
const seedSable = seeder('Sable Nightwind', (sheet) => {
  sheet.classes.add({ name: 'Rogue (Arcane Trickster)', level: 5 });
  sheet.classes.add({ name: 'Wizard (Evoker)', level: 2 });

  sheet.hitPoints.setTotal(45);
  sheet.hitPoints.setCurrent(38);
  sheet.hitPoints.setTemporary(5);
  sheet.setArmorClass(15);

  const d6 = sheet.hitDices.add(6);
  d6.setTotal(2);
  d6.setCurrent(2);
  const d8 = sheet.hitDices.add(8);
  d8.setTotal(5);
  d8.setCurrent(3);

  sheet.journalAndNotes.appendDay(
    'Arrived in Barovia. The mists closed behind us; there is no road back. A funeral in the village square.',
  );
  sheet.journalAndNotes.appendDay('Met Ireena Kolyana. Strahd knows we are here.');
  sheet.journalAndNotes.appendDay('Windmill on the hill — Old Bonegrinder. We did not linger.');
  sheet.journalAndNotes.setNotes(
    'Find the Sunsword. Tome of Strahd location still unknown. Madam Eva reading pointed to the Amber Temple.',
  );

  sheet.inventory.coins.setPp(2);
  sheet.inventory.coins.setGp(84);
  sheet.inventory.coins.setSp(37);
  sheet.inventory.coins.setCp(12);
  sheet.inventory.add({
    name: 'Thieves Tools',
    description: 'Proficient. Used for locks and traps.',
    count: 1,
  });
  sheet.inventory.add({
    name: 'Potion of Healing',
    description: 'Regain 2d4+2 HP as an action.',
    count: 3,
  });
  sheet.inventory.add({ name: 'Rations', description: 'Days of trail food.', count: 5 });
  sheet.inventory.add({ name: 'Grappling Hook', count: 1 });

  sheet.equipment.addWeapon({
    name: 'Rapier',
    description: '1d8 piercing, finesse.',
    equipped: true,
  });
  sheet.equipment.addWeapon({ name: 'Shortbow', description: '1d6 piercing, range 80/320.' });
  sheet.equipment.addWeapon({
    name: 'Dagger (x2)',
    description: '1d4 piercing, finesse, thrown 20/60.',
    equipped: true,
  });
  sheet.equipment.addOther({
    name: 'Cloak of Elvenkind',
    description: 'Advantage on Stealth to hide; disadvantage on Perception to see you.',
    attuned: true,
    equipped: true,
  });
  sheet.equipment.addOther({
    name: 'Studded Leather',
    description: 'AC 12 + Dex.',
    equipped: true,
  });

  const rogueFeats = sheet.featsAndTraits.createCategory('Rogue');
  rogueFeats.add({
    name: 'Sneak Attack',
    description: '+3d6 once per turn when you have advantage or an ally is adjacent to the target.',
  });
  rogueFeats.add({
    name: 'Cunning Action',
    description: 'Bonus action to Dash, Disengage, or Hide.',
  });
  rogueFeats.add({
    name: 'Uncanny Dodge',
    description: 'Reaction to halve damage from one attacker you can see.',
  });
  const wizardFeats = sheet.featsAndTraits.createCategory('Wizard');
  wizardFeats.add({
    name: 'Arcane Recovery',
    description: 'Once per day on a short rest, recover spell slots up to half your wizard level.',
  });
  wizardFeats.add({
    name: 'Sculpt Spells',
    description: 'Protect allies from your own evocation spells.',
  });
  // An empty category, because an empty one renders differently and should be visible in dev.
  sheet.featsAndTraits.createCategory('Background');
  sheet.featsAndTraits.add({
    name: 'Darkvision',
    description: 'See in dim light within 60 ft as if bright.',
  });

  const combat = sheet.spellList.createCategory('Combat');
  spell(
    combat.add({ name: 'Fire Bolt', description: 'Ranged spell attack, 2d10 fire.' }),
    'c',
    true,
  );
  spell(
    combat.add({ name: 'Fireball', description: '20-ft radius, 8d6 fire; Dex save for half.' }),
    3,
    true,
  );
  spell(
    combat.add({ name: 'Shield', description: 'Reaction; +5 AC until your next turn.' }),
    1,
    true,
  );
  const utility = sheet.spellList.createCategory('Utility');
  spell(
    utility.add({ name: 'Mage Hand', description: 'Spectral hand manipulates objects at range.' }),
    'c',
    true,
  );
  spell(
    utility.add({ name: 'Disguise Self', description: 'Change your appearance for 1 hour.' }),
    1,
    false,
  );
  spell(
    utility.add({ name: 'Misty Step', description: 'Bonus action; teleport up to 30 ft.' }),
    2,
    true,
  );
  spell(
    sheet.spellList.add({ name: 'Detect Magic', description: 'Ritual. Sense magic within 30 ft.' }),
    1,
    false,
  );

  const slots = sheet.counters.spellSlots;
  slots[0]?.setTotal(4);
  slots[0]?.setCurrent(4);
  slots[1]?.setTotal(2);
  slots[1]?.setCurrent(1);
  const classCounters = sheet.counters.createCategory('Class Features');
  counter(
    classCounters.add({
      name: 'Arcane Recovery',
      description: 'Recover expended spell slots, once per day.',
    }),
    1,
    1,
  );
  const itemCounters = sheet.counters.createCategory('Items');
  counter(
    itemCounters.add({
      name: 'Wand of Magic Missiles',
      description: 'Regains 1d6+1 charges daily at dawn.',
    }),
    7,
    5,
  );
  // Spent, so a dimmed counter is on screen without having to spend one first.
  counter(
    sheet.counters.add({ name: 'Inspiration', description: 'DM-granted; spend for advantage.' }),
    1,
    0,
  );

  const { abilities, skills } = sheet.abilitiesAndSkills;
  sheet.abilitiesAndSkills.setProficiencyBonus(3);
  sheet.abilitiesAndSkills.setPassivePerception(14);
  sheet.abilitiesAndSkills.setSpeed(30);
  ability(abilities.strength, 10, 0, 0);
  ability(abilities.dexterity, 17, 3, 6, true);
  ability(abilities.constitution, 13, 1, 1);
  ability(abilities.intelligence, 16, 3, 6, true);
  ability(abilities.wisdom, 12, 1, 1);
  ability(abilities.charisma, 14, 2, 2);
  skill(skills.acrobatics, 6, true);
  skill(skills.animalHandling, 1);
  skill(skills.arcana, 6, true);
  skill(skills.athletics, 0);
  skill(skills.deception, 5, true);
  skill(skills.history, 3);
  skill(skills.insight, 4, true);
  skill(skills.intimidation, 2);
  skill(skills.investigation, 6, true);
  skill(skills.medicine, 1);
  skill(skills.nature, 3);
  skill(skills.perception, 4, true);
  skill(skills.performance, 2);
  skill(skills.persuasion, 5, true);
  skill(skills.religion, 3);
  skill(skills.sleightOfHand, 9, true, true);
  skill(skills.stealth, 9, true, true);
  skill(skills.survival, 1);
});

/** Deliberately sparse: the list should show a character that has barely been filled in. */
const seedThorne = seeder('Thorne Ironfell', (sheet) => {
  sheet.classes.add({ name: 'Fighter (Battle Master)', level: 8 });
  sheet.hitPoints.setTotal(71);
  sheet.hitPoints.setCurrent(71);
  sheet.setArmorClass(18);
  const d10 = sheet.hitDices.add(10);
  d10.setTotal(8);
  d10.setCurrent(8);
  sheet.equipment.addWeapon({
    name: 'Greatsword',
    description: '2d6 slashing, heavy, two-handed.',
    equipped: true,
  });
});

/** Barely started at all — the blank-ish end of the range. */
const seedWren = seeder('Wren Duskwhisper', (sheet) => {
  sheet.classes.add({ name: 'Druid (Circle of the Moon)', level: 4 });
  sheet.hitPoints.setTotal(27);
  sheet.hitPoints.setCurrent(27);
  sheet.setArmorClass(14);
});

function spell(added: SpellBO, level: SpellLevel, prepared: boolean): void {
  added.setLevel(level);
  added.setPrepared(prepared);
}

function counter(added: CounterBO, total: number, current: number): void {
  added.setTotal(total);
  added.setCurrent(current);
}

function ability(
  target: AbilityBO,
  score: number,
  modifier: number,
  savingThrowModifier: number,
  savingThrowProficient = false,
): void {
  target.setScore(score);
  target.setModifier(modifier);
  target.setSavingThrowModifier(savingThrowModifier);
  target.setSavingThrowProficient(savingThrowProficient);
}

function skill(target: SkillBO, modifier: number, proficient = false, expertise = false): void {
  target.setModifier(modifier);
  target.setProficient(proficient);
  target.setExpertise(expertise);
}
