import { observable, toJS } from 'mobx';
import type { CharacterDocument } from '../data/schema/index.js';
import { ClassesBO } from './classes.js';
import { EquipmentBO } from './equipment.js';
import { type FeatsAndTraitsBO, makeFeatsAndTraits } from './featsAndTraits.js';
import { nonNegativeInt, trimmedName } from './guards.js';
import { HitDicesBO } from './hitDices.js';
import { HitPointsBO } from './hitPoints.js';
import { InventoryBO } from './inventory.js';
import { JournalAndNotesBO } from './journalAndNotes.js';
import './mobxConfig.js';
import type { CharacterData } from './types.js';

export class CharacterSheetBO {
  /**
   * `#` rather than TypeScript's `private`: `private` is erased at compile time, so a cast or
   * plain JavaScript would reach the document anyway. Runtime enforcement is the point.
   *
   * Wrapped once, here. Every other business object reads through this one observable and
   * carries no MobX annotation of its own. Later tasks reach it as `this.#doc.<field>` from
   * inside this class's own constructor when they build each sub-object — no accessor needed,
   * because a private field is visible to the class body that declares it.
   */
  readonly #doc: CharacterData;

  readonly classes: ClassesBO;
  readonly hitPoints: HitPointsBO;
  readonly hitDices: HitDicesBO;
  readonly journalAndNotes: JournalAndNotesBO;
  readonly inventory: InventoryBO;
  readonly equipment: EquipmentBO;
  readonly featsAndTraits: FeatsAndTraitsBO;

  constructor(doc: CharacterDocument) {
    this.#doc = observable(doc);
    this.classes = new ClassesBO(this.#doc.classes);
    this.hitPoints = new HitPointsBO(this.#doc.hitPoints);
    this.hitDices = new HitDicesBO(this.#doc.hitDices);
    this.journalAndNotes = new JournalAndNotesBO(this.#doc.journalAndNotes);
    this.inventory = new InventoryBO(this.#doc.inventory.coins, this.#doc.inventory.items);
    this.equipment = new EquipmentBO(this.#doc.equipment.weapons, this.#doc.equipment.other);
    this.featsAndTraits = makeFeatsAndTraits(this.#doc.featsAndTraits);
  }

  get id(): string {
    return this.#doc.id;
  }

  get name(): string {
    return this.#doc.name;
  }

  setName(value: string): void {
    this.#doc.name = trimmedName(value);
  }

  /** Derived: the sum of class levels. Never stored — see spec §2.6. */
  get level(): number {
    return this.#doc.classes.reduce((total, entry) => total + entry.level, 0);
  }

  get armorClass(): number {
    return this.#doc.armorClass;
  }

  setArmorClass(value: number): void {
    this.#doc.armorClass = nonNegativeInt(value);
  }

  /** `toJS` of the observable document. This is literally the file that gets saved. */
  toDocument(): CharacterDocument {
    return toJS(this.#doc);
  }
}
