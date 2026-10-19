import type { FocusEvent } from 'react';

/**
 * The `onFocus` of a field with `selectOnFocus` on: the whole value is selected, so typing
 * replaces it, while a second click still places the caret. One handler for every field that
 * offers the switch, so they cannot drift apart.
 */
export function selectAllOnFocus(enabled: boolean) {
  return enabled
    ? (event: FocusEvent<HTMLInputElement>) => event.currentTarget.select()
    : undefined;
}
