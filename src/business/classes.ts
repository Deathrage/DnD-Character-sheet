import { createId } from './createId.js';
import { RuleViolation } from './errors.js';
import { nonNegativeInt, trimmedName } from './guards.js';
import { NodeBO } from './nodeBO.js';
import type { ClassData } from './types.js';

export interface NewClass {
  name: string;
  level?: number;
}

export class ClassesBO {
  readonly #classes: ClassData[];

  constructor(classes: ClassData[]) {
    this.#classes = classes;
  }

  get items(): ClassBO[] {
    return this.#classes.map((node) => new ClassBO(node, this.#classes));
  }

  add({ name, level = 0 }: NewClass): ClassBO {
    const trimmed = trimmedName(name);
    rejectDuplicate(this.#classes, trimmed, null);

    this.#classes.push({ id: createId(), name: trimmed, level: nonNegativeInt(level) });
    // MobX's observable array deep-enhances a pushed plain object into a new observable clone
    // rather than wiring the pushed object in place (verified against mobx@7.0.3), so the node
    // this ClassBO must hold is whatever actually landed in the array, not the value just
    // pushed. Reading it back keeps "hold references, never copies" true for the returned object.
    const node = this.#classes.at(-1);
    if (node === undefined) {
      throw new Error('unreachable: the entry just pushed is missing from the array');
    }
    return new ClassBO(node, this.#classes);
  }
}

export class ClassBO extends NodeBO<ClassData> {
  get id(): string {
    return this.node.id;
  }

  get name(): string {
    return this.node.name;
  }

  setName(value: string): void {
    const trimmed = trimmedName(value);
    rejectDuplicate(this.siblings, trimmed, this.node);
    this.node.name = trimmed;
  }

  get level(): number {
    return this.node.level;
  }

  setLevel(value: number): void {
    this.node.level = nonNegativeInt(value);
  }
}

/** `except` is the node being renamed, so renaming a class to its own name is not a duplicate. */
function rejectDuplicate(classes: readonly ClassData[], name: string, except: ClassData | null) {
  if (classes.some((entry) => entry !== except && entry.name === name)) {
    throw new RuleViolation('DUPLICATE_NAME', `a class named "${name}" already exists`);
  }
}
