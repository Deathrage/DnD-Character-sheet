import { createId } from './createId.js';
import { positiveInt, rejectDuplicate, trimmedName } from './guards.js';
import { NodeBO } from './nodeBO.js';
import { pushAndRead } from './observableList.js';
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

  add({ name, level = 1 }: NewClass): ClassBO {
    const trimmed = trimmedName(name);
    rejectDuplicate(this.#classes, trimmed, null, 'class');

    const node = pushAndRead(this.#classes, {
      id: createId(),
      name: trimmed,
      level: positiveInt(level),
    });
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
    rejectDuplicate(this.siblings, trimmed, this.node, 'class');
    this.node.name = trimmed;
  }

  get level(): number {
    return this.node.level;
  }

  setLevel(value: number): void {
    this.node.level = positiveInt(value);
  }
}
