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
 * spliced or replaced, a key deleted, however deep. Each observable node is observed once; a
 * node that arrives is observed as it arrives, and a node that leaves is released.
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
  const disposers = new Map<object, Lambda>();

  const isNode = (value: unknown): value is object =>
    isObservableObject(value) || isObservableArray(value);

  const release = (value: unknown): void => {
    if (!isNode(value)) return;
    const dispose = disposers.get(value);
    if (dispose === undefined) return;
    dispose();
    disposers.delete(value);
    for (const child of values(value)) release(child);
  };

  const attach = (value: unknown): void => {
    if (!isNode(value) || disposers.has(value)) return;
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
    disposers.set(value, observe(value, onChange));
    for (const child of values(value)) attach(child);
  };

  attach(root);
  return () => {
    for (const dispose of disposers.values()) dispose();
    disposers.clear();
  };
}
