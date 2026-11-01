import {
  type IArrayDidChange,
  type IObjectDidChange,
  isObservableArray,
  isObservableObject,
  type Lambda,
  observe,
  values,
} from 'mobx';
import './mobxConfig.js';

/**
 * Calls `listener` after any change anywhere under `root`: a property set, an item pushed,
 * spliced or replaced, a key deleted, however deep. Each observable node is observed once,
 * however many parents hold it: a node that arrives is observed as it arrives, and one that
 * leaves is released only when its last parent lets go. That last part matters because the
 * business layer rehomes before it removes — `CategoryBO.remove()` pushes a category's items
 * into Uncategorized and then splices the category out — so for a moment an item has two
 * parents, and releasing it with the first would leave it unobserved while it is still in the
 * document. An edit to it would then show on screen and never reach autosave.
 *
 * This is what lets autosave notice a change in constant time. Its first implementation was a
 * `reaction` over `toDocument()`, which deep-copies the whole document to learn that something
 * in it changed, so every keystroke cost a copy of the entire sheet — measured at a 6× CPU
 * throttle as the part of each keystroke that grew with the character, about 25ms of 116ms on
 * a 468 KB sheet. Here a keystroke costs one listener call.
 *
 * Written here rather than taken from `mobx-utils`, whose `deepObserve` this is a reduction
 * of: that package declares MobX 6 and this app is on 7, and the part the app needs is this
 * file. Objects and arrays only, which is all `observable(doc)` makes of a `CharacterDocument`;
 * primitives have nothing to observe.
 */
export function deepObserve(root: object, listener: () => void): Lambda {
  /** Per observed node: how to stop, and how many parents currently hold it. */
  const observed = new Map<object, { dispose: Lambda; holders: number }>();

  const isNode = (value: unknown): value is object =>
    isObservableObject(value) || isObservableArray(value);

  const release = (value: unknown): void => {
    if (!isNode(value)) return;
    const entry = observed.get(value);
    if (entry === undefined) return;
    entry.holders -= 1;
    if (entry.holders > 0) return;
    entry.dispose();
    observed.delete(value);
    for (const child of values(value)) release(child);
  };

  const attach = (value: unknown): void => {
    if (!isNode(value)) return;
    const entry = observed.get(value);
    if (entry !== undefined) {
      entry.holders += 1;
      return;
    }
    const onChange = (change: IArrayDidChange | IObjectDidChange): void => {
      if (change.type === 'splice') {
        for (const removed of change.removed) release(removed);
        for (const added of change.added) attach(added);
      } else {
        if ('oldValue' in change) release(change.oldValue);
        if ('newValue' in change) attach(change.newValue);
      }
      listener();
    };
    // One call for both kinds: MobX dispatches on the value, not the overload.
    observed.set(value, { dispose: observe(value, onChange), holders: 1 });
    for (const child of values(value)) attach(child);
  };

  attach(root);
  return () => {
    for (const { dispose } of observed.values()) dispose();
    observed.clear();
  };
}
