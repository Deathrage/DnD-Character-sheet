import { useState } from 'react';

/**
 * `useState` that survives a reload and a relaunch of the installed app, for view state only —
 * which blocks are open. Never for anything about the character: that lives in the document.
 *
 * localStorage rather than IndexedDB because it is synchronous, so the first render is already
 * right instead of flashing the default. It can throw (Safari private mode, a full quota) and it
 * can hold anything, so every failure falls back to `initial`: losing a collapse is harmless.
 */
export function usePersistedState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState(() => read(key, initial));
  return [
    value,
    (next) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Still works for this mount; it just will not be remembered.
      }
    },
  ];
}

function read<T>(key: string, initial: T): T {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return initial;
    const parsed: unknown = JSON.parse(stored);
    // A shape check, not a validation: enough that a hand-edited value cannot crash a render.
    return typeof parsed === typeof initial && parsed !== null ? (parsed as T) : initial;
  } catch {
    return initial;
  }
}
