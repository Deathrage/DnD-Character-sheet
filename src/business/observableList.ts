/**
 * `list.push(value)` alone is not safe when `list` is (or lives inside) a MobX observable
 * structure and `value` is a plain object literal: MobX's deep observability converts a plain
 * object into a new observable proxy at the moment it is written into an observable array —
 * it does not wire the literal you handed it in place. The object actually stored in the array
 * is a different reference from `value`. Anything built from `value` afterward — a business
 * object wrapping it, a variable held onto for later mutation — reads and writes a detached
 * copy that is not part of the document, and those writes silently never reach `toDocument()`.
 * Verified directly against the installed mobx@7.0.3:
 *
 * ```js
 * const obs = observable({ list: [] });
 * const node = { name: 'a' };
 * obs.list.push(node);
 * obs.list[0] === node; // false — obs.list[0] is a clone, not `node`
 * ```
 *
 * This does NOT apply to a value that is already observable — for example an item moved from
 * one observable array into another (`destination.push(this.node)`), where `this.node` was
 * already read out of some other observable array. MobX's deep enhancer passes an
 * already-observable value through unchanged, so a move is unaffected and does not need this
 * helper; only a freshly-created plain object being written into an observable array for the
 * first time needs its stored reference read back.
 *
 * `pushAndRead` pushes `value` and returns whatever is actually now the last element of `list`,
 * so callers always hold the same object the document holds.
 */
export function pushAndRead<T extends object>(list: T[], value: T): T {
  list.push(value);
  const stored = list.at(-1);
  if (stored === undefined) {
    throw new Error('unreachable: the value just pushed is missing from the list');
  }
  return stored;
}
