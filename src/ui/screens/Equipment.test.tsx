// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { equipment, noEquipmentActions } from '../fixtures.js';
import { Equipment } from './Equipment.js';

beforeEach(() => localStorage.clear());

const equipmentFor = (characterId: string) =>
  render(
    <Equipment
      characterId={characterId}
      data={equipment}
      actions={noEquipmentActions}
      onClose={() => {}}
    />,
  );

describe('Equipment blocks', () => {
  it('start open, and only Weapons and Other take new items', () => {
    equipmentFor('c');
    expect(screen.getByText('Shortbow')).toBeTruthy();
    // Attuned, Equipped and Other: the derived blocks repeat it.
    expect(screen.getAllByText('Cloak of Elvenkind')).toHaveLength(3);

    expect(screen.getByRole('button', { name: 'Add entry to Weapons' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add entry to Other Equipment' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add entry to Attuned Items' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add entry to Equipped' })).toBeNull();
  });

  it('collapse, and stay collapsed across a remount of the same character only', () => {
    const { unmount } = equipmentFor('c');
    fireEvent.click(screen.getByRole('button', { name: /^Weapons/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Attuned Items/ }));
    expect(screen.queryByText('Shortbow')).toBeNull();
    expect(screen.getAllByText('Cloak of Elvenkind')).toHaveLength(2);
    unmount();

    const other = equipmentFor('another');
    expect(screen.getByText('Shortbow')).toBeTruthy();
    other.unmount();

    equipmentFor('c');
    expect(screen.queryByText('Shortbow')).toBeNull();
    expect(screen.getAllByText('Cloak of Elvenkind')).toHaveLength(2);
  });
});
