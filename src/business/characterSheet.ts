import { observable, toJS } from 'mobx';
import type { CharacterDocument } from '../data/schema/index.js';
import { nonNegativeInt, trimmedName } from './guards.js';
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

  constructor(doc: CharacterDocument) {
    this.#doc = observable(doc);
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
