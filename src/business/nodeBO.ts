import { RuleViolation } from './errors.js';

/**
 * A business object over one node of the document.
 *
 * It holds the node directly. An earlier draft resolved by id on every access so an object
 * could survive the document being swapped underneath it; that was over-built, because nothing
 * swaps a document in place — the raw-JSON editor disposes its sheet and re-opens. What
 * survives is `GONE`, raised when an object is removed twice: removing something that is
 * already gone is a bug worth hearing about, not a no-op.
 *
 * It holds a reference, never a copy of a value. Cache a name or mirror a list once and memory
 * and file can disagree, which is the class of bug this codebase is built to avoid.
 */
export abstract class NodeBO<TData extends object> {
  /**
   * `protected`, not `#`. The runtime-privacy requirement applies to the document on
   * `CharacterSheetBO` — that is what the UI must not reach. Subclasses legitimately need both
   * their node and their sibling array: a duplicate-name check reads the siblings, and so does
   * `remove()`.
   */
  /**
   * `siblings` is NOT readonly: `CategorizedItemBO.moveTo` repoints it when an item changes
   * bucket. Leaving it readonly would keep a moved item pointing at the array it came from, so
   * a later `remove()` would search the wrong list and throw GONE for an item that is plainly
   * still there.
   */
  constructor(
    protected readonly node: TData,
    protected siblings: TData[],
  ) {}

  remove(): void {
    const index = this.siblings.indexOf(this.node);
    if (index === -1) {
      throw new RuleViolation('GONE', 'this item is no longer in the document');
    }
    this.siblings.splice(index, 1);
  }
}
