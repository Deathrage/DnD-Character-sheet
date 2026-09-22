// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { stubDialogElement } from '../../test/stubDialog.js';
import { ResponsiveDialog } from './ResponsiveDialog.js';

/**
 * Criteria 13 and 14 turn on one distinction: every dialog is dismissible three ways, and the
 * persistence gate is dismissible none. That is the whole of what is worth asserting here — the
 * bottom-sheet-versus-modal split is pure CSS (see `styles.css`), which a jsdom test cannot see
 * and which the Storybook viewport toolbar shows honestly.
 */
beforeAll(stubDialogElement);

describe('ResponsiveDialog', () => {
  const cancel = (element: Element) =>
    fireEvent(element, new Event('cancel', { bubbles: true, cancelable: true }));

  it('opens as a modal and closes on Escape, the scrim and the close button', () => {
    const onClose = vi.fn();
    render(
      <ResponsiveDialog title="Classes" open onClose={onClose}>
        <p>body</p>
      </ResponsiveDialog>,
    );
    const dialog = screen.getByRole('dialog', { hidden: true });
    expect((dialog as HTMLDialogElement).open).toBe(true);

    cancel(dialog);
    fireEvent.click(dialog); // the scrim: a click whose target is the <dialog> itself
    fireEvent.click(screen.getByLabelText('Close'));

    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not close on a click inside the body', () => {
    const onClose = vi.fn();
    render(
      <ResponsiveDialog title="Classes" open onClose={onClose}>
        <p>body</p>
      </ResponsiveDialog>,
    );

    fireEvent.click(screen.getByText('body'));

    expect(onClose).not.toHaveBeenCalled();
  });

  it('a blocking dialog has no close button and ignores Escape and the scrim', () => {
    const onClose = vi.fn();
    render(
      <ResponsiveDialog title="Storage" open blocking onClose={onClose}>
        <p>body</p>
      </ResponsiveDialog>,
    );
    const dialog = screen.getByRole('dialog', { hidden: true });

    expect(screen.queryByLabelText('Close')).toBeNull();
    const event = new Event('cancel', { bubbles: true, cancelable: true });
    fireEvent(dialog, event);
    fireEvent.click(dialog);

    expect(event.defaultPrevented).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes the element when open goes false', () => {
    const { rerender } = render(
      <ResponsiveDialog title="Classes" open onClose={() => {}}>
        <p>body</p>
      </ResponsiveDialog>,
    );
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);

    rerender(
      <ResponsiveDialog title="Classes" open={false} onClose={() => {}}>
        <p>body</p>
      </ResponsiveDialog>,
    );

    expect(dialog.open).toBe(false);
  });
});
