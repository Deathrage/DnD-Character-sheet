import { RuleViolation } from './errors.js';
import type { JournalAndNotesData } from './types.js';

export class JournalAndNotesBO {
  readonly #node: JournalAndNotesData;

  constructor(node: JournalAndNotesData) {
    this.#node = node;
  }

  get notes(): string {
    return this.#node.notes;
  }

  /** Not trimmed: freeform prose, where leading whitespace may be deliberate. */
  setNotes(value: string): void {
    this.#node.notes = value;
  }

  get days(): JournalDayBO[] {
    return this.#node.journal.map((_, index) => new JournalDayBO(this.#node.journal, index));
  }

  /**
   * Appends at the end only, per `Model.ts`: the array index IS the day index, so inserting
   * anywhere else would renumber every day after it.
   */
  appendDay(text = ''): JournalDayBO {
    this.#node.journal.push(text);
    return new JournalDayBO(this.#node.journal, this.#node.journal.length - 1);
  }

  /** The newest day only. No other index is deletable, for the same reason. */
  deleteNewestDay(): void {
    if (this.#node.journal.length === 0) {
      throw new RuleViolation('GONE', 'there is no journal day to delete');
    }
    this.#node.journal.pop();
  }
}

export class JournalDayBO {
  readonly #journal: string[];
  readonly #index: number;

  constructor(journal: string[], index: number) {
    this.#journal = journal;
    this.#index = index;
  }

  get dayIndex(): number {
    return this.#index;
  }

  get text(): string {
    return this.#require();
  }

  setText(value: string): void {
    this.#require();
    this.#journal[this.#index] = value;
  }

  #require(): string {
    const text = this.#journal[this.#index];
    if (text === undefined) {
      throw new RuleViolation('GONE', `journal day ${this.#index} is no longer in the document`);
    }
    return text;
  }
}
