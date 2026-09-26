import { integer, nonNegativeInt } from './guards.js';
import type { AbilityData, CharacterData, SkillData } from './types.js';

type AbilitiesAndSkillsData = CharacterData['abilitiesAndSkills'];
export type AbilityKey = keyof AbilitiesAndSkillsData['abilities'];
export type SkillKey = keyof AbilitiesAndSkillsData['skills'];

export class AbilitiesAndSkillsBO {
  readonly #node: AbilitiesAndSkillsData;
  readonly abilities: Record<AbilityKey, AbilityBO>;
  readonly skills: Record<SkillKey, SkillBO>;

  constructor(node: AbilitiesAndSkillsData) {
    this.#node = node;

    // Fixed key sets, so every object is built once in the constructor. There is nothing to add
    // or remove, and the keys are the identity, so none of these carry an id.
    this.abilities = Object.fromEntries(
      Object.keys(node.abilities).map((key) => [
        key,
        new AbilityBO(node.abilities[key as AbilityKey]),
      ]),
    ) as Record<AbilityKey, AbilityBO>;

    this.skills = Object.fromEntries(
      Object.keys(node.skills).map((key) => [key, new SkillBO(node.skills[key as SkillKey])]),
    ) as Record<SkillKey, SkillBO>;
  }

  get proficiencyBonus(): number {
    return this.#node.proficiencyBonus;
  }

  setProficiencyBonus(value: number): void {
    this.#node.proficiencyBonus = nonNegativeInt(value);
  }

  get passivePerception(): number {
    return this.#node.passivePerception;
  }

  /** Player-entered, never computed from the perception skill. The app computes nothing. */
  setPassivePerception(value: number): void {
    this.#node.passivePerception = nonNegativeInt(value);
  }

  get speed(): number {
    return this.#node.speed;
  }

  setSpeed(value: number): void {
    this.#node.speed = nonNegativeInt(value);
  }

  get initiative(): number {
    return this.#node.initiative;
  }

  /**
   * Signed, because it is a modifier, and entered by the player — never taken from the Dexterity
   * modifier, which Alert or Jack of All Trades would make wrong.
   */
  setInitiative(value: number): void {
    this.#node.initiative = integer(value);
  }
}

/** No `proficient`: ability-check proficiency has no referent in the rules (spec section 3.1). */
export class AbilityBO {
  readonly #node: AbilityData;

  constructor(node: AbilityData) {
    this.#node = node;
  }

  get score(): number {
    return this.#node.score;
  }

  setScore(value: number): void {
    this.#node.score = nonNegativeInt(value);
  }

  get modifier(): number {
    return this.#node.modifier;
  }

  /** Signed, and entered by the player — never derived from the score. */
  setModifier(value: number): void {
    this.#node.modifier = integer(value);
  }

  get savingThrowModifier(): number {
    return this.#node.savingThrowModifier;
  }

  setSavingThrowModifier(value: number): void {
    this.#node.savingThrowModifier = integer(value);
  }

  get savingThrowProficient(): boolean {
    return this.#node.savingThrowProficient;
  }

  setSavingThrowProficient(value: boolean): void {
    this.#node.savingThrowProficient = value;
  }
}

export class SkillBO {
  readonly #node: SkillData;

  constructor(node: SkillData) {
    this.#node = node;
  }

  get modifier(): number {
    return this.#node.modifier;
  }

  setModifier(value: number): void {
    this.#node.modifier = integer(value);
  }

  get proficient(): boolean {
    return this.#node.proficient;
  }

  setProficient(value: boolean): void {
    this.#node.proficient = value;
  }

  get expertise(): boolean {
    return this.#node.expertise;
  }

  setExpertise(value: boolean): void {
    this.#node.expertise = value;
  }
}
