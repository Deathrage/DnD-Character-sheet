// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { stubDialogElement } from '../../test/stubDialog.js';
import { ConfirmDelete } from './ConfirmDelete.js';
import { ResponsiveDialog } from './ResponsiveDialog.js';

beforeAll(stubDialogElement);

describe('ConfirmDelete', () => {
  it('deletes only once confirmed', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDelete what="Longsword" onConfirm={onConfirm}>
        Remove
      </ConfirmDelete>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel', hidden: true }));
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete', hidden: true }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('Escape on the confirm leaves the dialog beneath it open', () => {
    const onOuterClose = vi.fn();
    render(
      <ResponsiveDialog title="Edit item" open onClose={onOuterClose}>
        <ConfirmDelete what="Longsword" onConfirm={() => {}}>
          Remove
        </ConfirmDelete>
      </ResponsiveDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove', hidden: true }));
    const confirm = screen.getByRole('dialog', { name: 'Delete?', hidden: true });

    fireEvent(confirm, new Event('cancel', { cancelable: true }));

    expect(screen.queryByRole('dialog', { name: 'Delete?', hidden: true })).toBeNull();
    expect(onOuterClose).not.toHaveBeenCalled();
  });
});
