import { longText, trimmedName } from './guards.js';
import { NodeBO } from './nodeBO.js';

export interface NamedItemData {
  id: string;
  name: string;
  description: string;
}

/**
 * The shared shape of the five item types that carry a name and a description: inventory items,
 * equipment, spells, counters, and feats. Five subclasses, so the abstraction is reuse rather
 * than speculation.
 */
export abstract class NamedItemBO<TData extends NamedItemData> extends NodeBO<TData> {
  get id(): string {
    return this.node.id;
  }

  get name(): string {
    return this.node.name;
  }

  setName(value: string): void {
    this.node.name = trimmedName(value);
  }

  get description(): string {
    return this.node.description;
  }

  /** Not trimmed: freeform prose, where leading whitespace may be deliberate. */
  setDescription(value: string): void {
    this.node.description = longText(value);
  }
}
