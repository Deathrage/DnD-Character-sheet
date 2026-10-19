import { useRef, type InputHTMLAttributes } from 'react';

type PressHandlers = Pick<InputHTMLAttributes<HTMLInputElement>, 'onPointerDown' | 'onClick'>;

/**
 * The handlers of a field with `selectOnFocus` on: a click or tap that focuses the field selects
 * its whole value, so typing replaces it. A press on a field that already has focus is left to
 * the browser. One hook for every field that offers the switch, so they cannot drift apart.
 *
 * It selects on the click, once the press is over, not on `focus`. WebKit, which is every
 * browser on iOS, collapses a selection made during the press as the button comes up: selected
 * on focus, a name got a caret in its middle and typing 17 over an AC of 18 gave 1178. And only
 * after a press, because `focus` also fires when the window comes back to a field left focused,
 * where selecting would let the next keystroke replace a half-typed value. Tab is not handled:
 * browsers select the value of a field tabbed into already.
 */
export function useSelectOnFocus(enabled: boolean): PressHandlers {
  const focusing = useRef(false);
  if (!enabled) return {};
  return {
    onPointerDown: (event) => {
      focusing.current = document.activeElement !== event.currentTarget;
    },
    onClick: (event) => {
      if (focusing.current) event.currentTarget.select();
      focusing.current = false;
    },
  };
}
