import { fireEvent } from '@testing-library/react';

/**
 * A click or a tap on a field, in the order a browser delivers it: pointerdown, focus, click.
 * `fireEvent.focus` alone is not a press, and a field that selects on the press has to tell the
 * two apart: focus also comes from Tab and from the window coming back.
 */
export function press(input: HTMLInputElement): void {
  fireEvent.pointerDown(input);
  input.focus();
  fireEvent.click(input);
}
