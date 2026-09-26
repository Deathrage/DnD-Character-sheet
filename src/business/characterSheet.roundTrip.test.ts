import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

/** Exercises every branch of the tree, so the assertions below speak for the whole document. */
function fill(sheet: CharacterSheetBO): void {
  sheet.setName('Sable Nightwind');
  sheet.setArmorClass(15);
  sheet.setInitiative(-1);
  sheet.setPortrait('data:image/jpeg;base64,/9j/4AAQ');
  sheet.classes.add({ name: 'Rogue', level: 5 });
  sheet.hitPoints.setTotal(45);
  sheet.hitDices.add(8).setTotal(5);
  sheet.journalAndNotes.appendDay('Arrived in Barovia.');
  sheet.journalAndNotes.setNotes('Find the Sunsword.');
  sheet.inventory.coins.setGp(84);
  sheet.inventory.add({ name: 'Rope', count: 1 });
  const rapier = sheet.equipment.addWeapon({ name: 'Rapier', equipped: true });
  rapier.setAttackAbility('dexterity');
  rapier.setAttackBonus(6);
  rapier.setAttackDamage('1d8+3 piercing');
  sheet.equipment.addOther({ name: 'Cloak', attuned: true });
  sheet.featsAndTraits.createCategory('Combat').add({ name: 'Sneak Attack' });
  sheet.featsAndTraits.add({ name: 'Darkvision' });
  sheet.spellList.createCategory('Evocation').add({ name: 'Fire Bolt' });
  sheet.spellList.add({ name: 'Prestidigitation' });
  sheet.spellList.spellcasting.add('intelligence', { attackBonus: 6, saveDc: 14 });
  sheet.counters.createCategory('Class features').add({ name: 'Rage' });
  sheet.counters.add({ name: 'Inspiration' });
  sheet.counters.spellSlots[0]?.setTotal(4);
  sheet.abilitiesAndSkills.setSpeed(30);
  sheet.abilitiesAndSkills.abilities.dexterity.setScore(18);
  sheet.abilitiesAndSkills.abilities.dexterity.setModifier(4);
  sheet.abilitiesAndSkills.skills.stealth.setProficient(true);
}

describe('the business object tree, end to end', () => {
  // The single most important property of this layer: the UI can only reach it through named
  // methods, so it cannot leave the document in a state the schema would reject — and autosave
  // validates then REFUSES loudly, so an invalid document stops all saving for that character.
  it('cannot produce a document the current schema rejects', () => {
    const sheet = sheetFor();
    fill(sheet);

    const result = CURRENT_SCHEMA.safeParse(sheet.toDocument());
    expect(result.success).toBe(true);
  });

  it('round-trips through the schema unchanged', () => {
    const sheet = sheetFor();
    fill(sheet);

    const doc = sheet.toDocument();
    expect(CURRENT_SCHEMA.parse(doc)).toEqual(doc);
  });

  it('survives a JSON round trip, so the file and memory agree', () => {
    const sheet = sheetFor();
    fill(sheet);

    const doc = sheet.toDocument();
    const reopened = new CharacterSheetBO(CURRENT_SCHEMA.parse(JSON.parse(JSON.stringify(doc))));

    expect(reopened.toDocument()).toEqual(doc);
  });

  it('puts no derived value in the saved document', () => {
    const sheet = sheetFor();
    fill(sheet);
    const doc = sheet.toDocument();

    expect(sheet.level).toBe(5);
    expect(doc).not.toHaveProperty('level');
    expect(doc.equipment).not.toHaveProperty('attuned');
    expect(doc.equipment).not.toHaveProperty('equipped');
  });

  it('mints a unique id for every item, which the schema enforces document-wide', () => {
    const sheet = sheetFor();
    fill(sheet);
    // A duplicate id anywhere would fail CURRENT_SCHEMA, so the first assertion already covers
    // this — but stating it separately names the property, so a failure reads as what it is.
    expect(CURRENT_SCHEMA.safeParse(sheet.toDocument()).success).toBe(true);
  });

  it('does not export the stored shapes from the public barrel', async () => {
    const barrel = await import('./index.js');
    // Types vanish at runtime, so this checks the value exports only — the real guard is that
    // `types.ts` is never re-exported, which a reader can see in index.ts at a glance.
    expect(Object.keys(barrel)).not.toContain('types');
    expect(barrel).not.toHaveProperty('CharacterData');
  });
});

const LONG_NAME = 'x'.repeat(81);
const LONG_CATEGORY_NAME = 'x'.repeat(41);
const LONG_TEXT = 'x'.repeat(20_001);

/**
 * One over-long write per kind of field the layer offers, named by what a player would be doing.
 * `?.` rather than `!` on the list lookups: `fill` put each item there, and if one were missing
 * the call would silently do nothing and the test would fail for not throwing — which is the
 * right failure, not a masked pass.
 */
const overLongWrites: [string, (sheet: CharacterSheetBO) => void][] = [
  ['the character name', (sheet) => sheet.setName(LONG_NAME)],
  ['a new class name', (sheet) => sheet.classes.add({ name: LONG_NAME })],
  ['a class rename', (sheet) => sheet.classes.items[0]?.setName(LONG_NAME)],
  ['a new inventory item name', (sheet) => sheet.inventory.add({ name: LONG_NAME })],
  ['an inventory item rename', (sheet) => sheet.inventory.items[0]?.setName(LONG_NAME)],
  ['a new weapon name', (sheet) => sheet.equipment.addWeapon({ name: LONG_NAME })],
  ['a weapon damage', (sheet) => sheet.equipment.weapons[0]?.setAttackDamage(LONG_NAME)],
  ['a new feat name', (sheet) => sheet.featsAndTraits.add({ name: LONG_NAME })],
  ['a new spell name', (sheet) => sheet.spellList.add({ name: LONG_NAME })],
  ['a new counter name', (sheet) => sheet.counters.add({ name: LONG_NAME })],
  ['a new category name', (sheet) => sheet.spellList.createCategory(LONG_CATEGORY_NAME)],
  ['a category rename', (sheet) => sheet.spellList.categories[0]?.setName(LONG_CATEGORY_NAME)],
  [
    "a new item's description",
    (sheet) => sheet.featsAndTraits.add({ name: 'Lucky', description: LONG_TEXT }),
  ],
  [
    'a description edit',
    (sheet) => sheet.featsAndTraits.uncategorized[0]?.setDescription(LONG_TEXT),
  ],
  ['the notes field', (sheet) => sheet.journalAndNotes.setNotes(LONG_TEXT)],
  ['a new journal day', (sheet) => sheet.journalAndNotes.appendDay(LONG_TEXT)],
  ['a journal day edit', (sheet) => sheet.journalAndNotes.days[0]?.setText(LONG_TEXT)],
];

// The same property as the first test in this file, from the other side: the schema caps a short
// name at 80 characters, a category name at 40 and freeform text at 20 000, and a document one
// character over is one autosave refuses — permanently, for that character. So every write that
// would breach a cap has to be refused at the setter, where the player still has the text.
describe('no write can exceed a length the schema caps', () => {
  it.each(overLongWrites)('refuses an over-long write to %s', (_label, write) => {
    const sheet = sheetFor();
    fill(sheet);

    expect(() => write(sheet)).toThrow(expect.objectContaining({ code: 'TOO_LONG' }) as Error);
    expect(CURRENT_SCHEMA.safeParse(sheet.toDocument()).success).toBe(true);
  });
});

/**
 * Every property reachable from a `CharacterSheetBO`: its own fields (`#doc` is a true private
 * field, so it is invisible here — that is exactly the invariant this walk is proving), every
 * getter on its prototype chain, and the same recursively for whatever those return, including
 * plain records (`abilities`, `skills`) and arrays (`items`, `categories`, ...).
 *
 * `Object.keys()` and `JSON.stringify()` both skip a prototype getter entirely, so a getter that
 * quietly returned the document would sail past the barrel test above. This walk uses
 * `Object.getOwnPropertyNames`, which does not skip it.
 *
 * Deliberately excludes `toDocument` by name: it is the one method allowed to hand back a plain
 * copy of the document (`toJS`, not the live `#doc`), so walking into its return value would
 * always "fail" and the exclusion has to be visible rather than accidental.
 */
function reachableValues(root: object): { path: string; value: unknown }[] {
  const found: { path: string; value: unknown }[] = [];
  const seen = new WeakSet<object>();

  const visit = (value: unknown, path: string): void => {
    if (value === null || typeof value === 'function') return;
    if (typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);

    found.push({ path, value });

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }

    let proto: object | null = value;
    let isOwn = true;
    while (proto !== null && proto !== Object.prototype) {
      for (const name of Object.getOwnPropertyNames(proto)) {
        if (name === 'constructor' || name === 'toDocument') continue;

        const descriptor = Object.getOwnPropertyDescriptor(proto, name);
        if (!descriptor) continue;

        let next: unknown;
        if (typeof descriptor.get === 'function') {
          try {
            next = descriptor.get.call(value);
          } catch {
            // An object in an invalid state (e.g. a removed node) may throw GONE. That is not a
            // leak, and letting it propagate would abort the whole walk and mask any leak found
            // elsewhere in the tree — so it is swallowed here, not asserted away.
            continue;
          }
        } else if (isOwn && 'value' in descriptor && typeof descriptor.value !== 'function') {
          next = descriptor.value;
        } else {
          continue; // methods, and non-getter members found on a prototype, are not invoked.
        }

        visit(next, `${path}.${name}`);
      }
      proto = Object.getPrototypeOf(proto);
      isOwn = false;
    }
  };

  visit(root, 'sheet');
  return found;
}

describe('the document is unreachable from outside CharacterSheetBO', () => {
  it('has no reachable property, own or inherited, whose value carries a schemaVersion key', () => {
    const sheet = sheetFor();
    fill(sheet);

    const leaks = reachableValues(sheet)
      .filter(({ value }) => Object.prototype.hasOwnProperty.call(value as object, 'schemaVersion'))
      .map(({ path }) => path);

    expect(leaks).toEqual([]);
  });
});
