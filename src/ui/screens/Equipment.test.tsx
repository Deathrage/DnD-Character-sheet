// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { spyActions } from '../../test/spyActions.js';
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
    const actions = spyActions(noEquipmentActions);
    renderWith(actions);
    open('Rapier');
    fireEvent.click(screen.getByRole('radio', { name: 'None' }));
    expect(actions.setWeaponAttackAbility).toHaveBeenCalledWith('e1', null);
  });

  // Saving per keystroke would trim the space after "1d8+3" before "piercing" could follow it.
  it('save damage on blur, never per keystroke, so a typed space survives', () => {
    const actions = spyActions(noEquipmentActions);
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
    const actions = spyActions(noEquipmentActions);
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
      count: null,
    });
  });

  it('create other equipment with no attack at all', () => {
    const actions = spyActions(noEquipmentActions);
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

const stackable = () => screen.getByRole('checkbox', { name: 'Stackable' }) as HTMLInputElement;

describe('weapon count', () => {
  it('shows on a stackable weapon only, before the attack badge, and edits from the row', () => {
    const actions = spyActions(noEquipmentActions);
    renderWith(actions);
    const dagger = rowOf('Dagger');
    const count = within(dagger).getByLabelText('Dagger count') as HTMLInputElement;
    expect(count.value).toBe('2');
    // The name's button, then the count, then the attack badge: the badge stays at the far right.
    expect([...dagger.children].map((element) => element.className)).toEqual([
      'recopen',
      'num qty',
      'atk',
    ]);
    expect(within(rowOf('Rapier')).queryByLabelText('Rapier count')).toBeNull();

    fireEvent.change(count, { target: { value: '1' } });
    expect(actions.setWeaponCount).toHaveBeenCalledWith('e3', 1);
  });

  // 0 is "none left", which is still a stack: the row keeps its field rather than reading 0 as
  // "no count".
  it('keeps the count on the row at 0', () => {
    const spent = { ...equipment.weapons[2]!, count: 0 };
    render(
      <Equipment
        characterId="c"
        data={{ ...equipment, weapons: [spent], attuned: [], equipped: [] }}
        actions={noEquipmentActions}
        onClose={() => {}}
      />,
    );
    const count = within(rowOf('Dagger')).getByLabelText('Dagger count') as HTMLInputElement;
    expect(count.value).toBe('0');
  });

  it('opens the edit dialog with Stackable ticked and the count beside it', () => {
    renderWith(noEquipmentActions);
    open('Dagger');
    expect(stackable().checked).toBe(true);
    expect((screen.getByLabelText('Count') as HTMLInputElement).value).toBe('2');
  });

  it('sits directly under the name in both weapon dialogs', () => {
    renderWith(noEquipmentActions);
    open('Rapier');
    const edit = stackable().closest('.stackrow')!;
    expect(edit.previousElementSibling?.querySelector('input')?.getAttribute('aria-label')).toBe(
      'Name',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    fireEvent.click(screen.getByRole('button', { name: 'Add entry to Weapons' }));
    const created = stackable().closest('.stackrow')!;
    expect(created.previousElementSibling?.id).toBe('new-equipment-name');
  });

  it('ticks Stackable through its action, which brings the count', () => {
    const actions = spyActions(noEquipmentActions);
    renderWith(actions);
    open('Rapier');
    expect(stackable().checked).toBe(false);
    expect(screen.queryByLabelText('Count')).toBeNull();
    fireEvent.click(stackable());
    expect(actions.setWeaponStackable).toHaveBeenCalledWith('e1', true);
  });

  it('edits the count from the dialog, and unticks Stackable with no confirmation', () => {
    const actions = spyActions(noEquipmentActions);
    renderWith(actions);
    open('Dagger');
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '7' } });
    expect(actions.setWeaponCount).toHaveBeenCalledWith('e3', 7);
    fireEvent.click(stackable());
    expect(actions.setWeaponStackable).toHaveBeenCalledWith('e3', false);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('creates a stackable weapon with the count it was given, starting from 0', () => {
    const actions = spyActions(noEquipmentActions);
    renderWith(actions);
    fireEvent.click(screen.getByRole('button', { name: 'Add entry to Weapons' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Javelin' } });
    expect(screen.queryByLabelText('Count')).toBeNull();
    fireEvent.click(stackable());
    expect((screen.getByLabelText('Count') as HTMLInputElement).value).toBe('0');
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(actions.addWeapon).toHaveBeenCalledWith(expect.objectContaining({ count: 5 }));
  });

  it('forgets the count when Stackable is unticked before Create', () => {
    const actions = spyActions(noEquipmentActions);
    renderWith(actions);
    fireEvent.click(screen.getByRole('button', { name: 'Add entry to Weapons' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Javelin' } });
    fireEvent.click(stackable());
    fireEvent.change(screen.getByLabelText('Count'), { target: { value: '5' } });
    fireEvent.click(stackable());
    expect(screen.queryByLabelText('Count')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(actions.addWeapon).toHaveBeenCalledWith(expect.objectContaining({ count: null }));
  });

  it('is only for weapons', () => {
    renderWith(noEquipmentActions);
    open('Studded Leather');
    expect(screen.queryByRole('checkbox', { name: 'Stackable' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add entry to Other Equipment' }));
    expect(screen.queryByRole('checkbox', { name: 'Stackable' })).toBeNull();
  });
});
