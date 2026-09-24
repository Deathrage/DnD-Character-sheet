// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { stubDialogElement } from '../../test/stubDialog.js';
import { noVitalsActions, sable } from '../fixtures.js';
import { VitalsHeader } from './VitalsHeader.js';

beforeAll(stubDialogElement);

const PORTRAIT = 'data:image/jpeg;base64,/9j/4AAQ';

function header(portrait: string | null) {
  const removePortrait = vi.fn();
  render(
    <VitalsHeader
      character={{ ...sable, portrait }}
      actions={{ ...noVitalsActions, removePortrait }}
      onBack={() => {}}
    />,
  );
  return removePortrait;
}

describe('VitalsHeader portrait', () => {
  it('opens a large view with Change and Remove', () => {
    header(PORTRAIT);
    fireEvent.click(screen.getByRole('button', { name: 'View portrait' }));
    expect(screen.getByRole('button', { name: 'Change image' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('removes only once the player confirms', () => {
    const removePortrait = header(PORTRAIT);
    fireEvent.click(screen.getByRole('button', { name: 'View portrait' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(removePortrait).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(removePortrait).toHaveBeenCalledOnce();
  });

  it('offers only Choose image when there is no portrait', () => {
    header(null);
    fireEvent.click(screen.getByRole('button', { name: 'Add portrait' }));
    expect(screen.getByRole('button', { name: 'Choose image' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});
