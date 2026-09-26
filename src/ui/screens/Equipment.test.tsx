// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { stubDialogElement } from '../../test/stubDialog.js';
import { equipment, noEquipmentActions } from '../fixtures.js';
import type { EquipmentActions } from '../types.js';
import { Equipment } from './Equipment.js';

beforeAll(stubDialogElement);
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

/** Every action a spy, so a test can assert exactly what the screen asked for. */
const spyActions = () =>
  Object.fromEntries(
    Object.keys(noEquipmentActions).map((key) => [key, vi.fn(() => null)]),
  ) as unknown as { [K in keyof EquipmentActions]: ReturnType<typeof vi.fn> } & EquipmentActions;

const renderWith = (actions: EquipmentActions) =>
  render(<Equipment characterId="c" data={equipment} actions={actions} onClose={() => {}} />);

/** The first row with this name; a weapon also appears in Equipped, with the same row. */
const rowOf = (name: string) => screen.getAllByText(name)[0]!.closest('.rec') as HTMLElement;
const open = (name: string) => fireEvent.click(rowOf(name).querySelector('.recopen')!);

describe('weapon attack on the row', () => {
  it('shows the ability and bonus on the right, and the damage leading the preview', () => {
    renderWith(noEquipmentActions);
    const rapier = rowOf('Rapier');
    expect(within(rapier).getByText('DEX')).toBeTruthy();
    expect(within(rapier).getByText('+6')).toBeTruthy();
    expect(rapier.querySelector('.pv')?.textContent).toBe(
      '1d8+3 piercing · 1d8 piercing, finesse.',
    );
  });

  it('looks as it always did for a weapon with no attack, and for other equipment', () => {
    renderWith(noEquipmentActions);
    const shortbow = rowOf('Shortbow');
    expect(shortbow.querySelector('.atk')).toBeNull();
    expect(shortbow.querySelector('.pv')?.textContent).toBe('1d6 piercing, range 80/320.');
    expect(rowOf('Studded Leather').querySelector('.atk')).toBeNull();
  });
});

describe('the weapon dialogs', () => {
  it('open on the attack: title, ability, bonus and damage', () => {
    renderWith(noEquipmentActions);
    open('Rapier');
    expect(screen.getByText('Edit weapon')).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'DEX' }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByLabelText('Attack bonus') as HTMLInputElement).value).toBe('+6');
    expect((screen.getByLabelText('Damage') as HTMLInputElement).value).toBe('1d8+3 piercing');
  });

  it('hide the bonus and damage until an ability is picked', () => {
    renderWith(noEquipmentActions);
    open('Shortbow');
    expect(screen.getByRole('radio', { name: 'None' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByLabelText('Attack bonus')).toBeNull();
    expect(screen.queryByLabelText('Damage')).toBeNull();
    expect(screen.getByText(/Pick the ability you attack with/)).toBeTruthy();
  });

  it('clear the attack when None is picked', () => {
    const actions = spyActions();
    renderWith(actions);
    open('Rapier');
    fireEvent.click(screen.getByRole('radio', { name: 'None' }));
    expect(actions.setWeaponAttackAbility).toHaveBeenCalledWith('e1', null);
  });

  // Saving per keystroke would trim the space after "1d8+3" before "piercing" could follow it.
  it('save damage on blur, never per keystroke, so a typed space survives', () => {
    const actions = spyActions();
    renderWith(actions);
    open('Rapier');
    const damage = screen.getByLabelText('Damage');
    let typed = '';
    for (const character of '1d8+4 piercing') {
      typed += character;
      fireEvent.change(damage, { target: { value: typed } });
    }
    expect(actions.setWeaponAttackDamage).not.toHaveBeenCalled();
    fireEvent.blur(damage);
    expect(actions.setWeaponAttackDamage).toHaveBeenCalledTimes(1);
    expect(actions.setWeaponAttackDamage).toHaveBeenCalledWith('e1', '1d8+4 piercing');
  });

  it('are only for weapons: other equipment keeps its dialog', () => {
    renderWith(noEquipmentActions);
    open('Studded Leather');
    expect(screen.getByText('Edit item')).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();
  });

  it('create a weapon with its attack, trimming the damage', () => {
    const actions = spyActions();
    renderWith(actions);
    fireEvent.click(screen.getByRole('button', { name: 'Add entry to Weapons' }));
    expect(screen.getByText('New weapon')).toBeTruthy();
    expect(screen.queryByLabelText('Attack bonus')).toBeNull();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Light Crossbow' } });
    fireEvent.click(screen.getByRole('radio', { name: 'DEX' }));
    fireEvent.change(screen.getByLabelText('Attack bonus'), { target: { value: '+5' } });
    fireEvent.change(screen.getByLabelText('Damage'), { target: { value: ' 1d8 piercing ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(actions.addWeapon).toHaveBeenCalledWith({
      name: 'Light Crossbow',
      description: '',
      attuned: false,
      equipped: false,
      attack: { ability: 'dexterity', attackBonus: 5, damage: '1d8 piercing' },
    });
  });

  it('create other equipment with no attack at all', () => {
    const actions = spyActions();
    renderWith(actions);
    fireEvent.click(screen.getByRole('button', { name: 'Add entry to Other Equipment' }));
    expect(screen.getByText('New equipment')).toBeTruthy();
    expect(screen.queryByRole('radiogroup')).toBeNull();

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bedroll' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(actions.addOther).toHaveBeenCalledWith({
      name: 'Bedroll',
      description: '',
      attuned: false,
      equipped: false,
    });
  });
});
