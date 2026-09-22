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
   * `protected`, not `#`, and not closed off by a module-scoped `WeakMap` either. Subclasses
   * legitimately need both their node and their sibling array — a duplicate-name check reads the
   * siblings, and so does `remove()` — and a base class cannot hand a subclass anything a cast
   * cannot also reach: any `protected` accessor reading a WeakMap is callable through the very
   * same `as any`. Closing this would mean giving up the base class.
   *
   * So `protected` here is an accepted limit, not an oversight, and the honest statement of it is
   * narrow: reaching these fields takes a deliberate cast. That is a different bar from a public
   * typed getter, which is what `CategoryBO.rawItems` was — reachable through the ordinary typed
   * API, by a caller who never wrote a cast, and therefore worth the WeakMap that replaced it.
   */
  /**
   * `siblings` is NOT readonly: `CategorizedItemBO.moveTo` repoints it when an item changes
   * bucket, so the field keeps meaning what it says. It is no longer what a move or a removal
   * acts on, though — a cached array can be orphaned by something else rehoming the node, so the
   * categorized subclass resolves the node's live bucket instead of trusting this.
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
