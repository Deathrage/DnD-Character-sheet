// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import { stubDialogElement } from '../../test/stubDialog.js';
import { noSpellListActions, spellList } from '../fixtures.js';
import type { SpellcastingView, SpellListActions } from '../types.js';
import { SpellList } from './SpellList.js';

beforeAll(stubDialogElement);
beforeEach(() => localStorage.clear());

/** Every action a spy, so a test can assert exactly what the screen asked for. */
const spyActions = () =>
  Object.fromEntries(
    Object.keys(noSpellListActions).map((key) => [key, vi.fn(() => null)]),
  ) as unknown as { [K in keyof SpellListActions]: ReturnType<typeof vi.fn> } & SpellListActions;

const renderWith = (
  spellcasting: SpellcastingView[],
  actions: SpellListActions = noSpellListActions,
) =>
  render(
    <SpellList
      characterId="c"
      data={{ ...spellList, spellcasting }}
      actions={actions}
      onClose={() => {}}
    />,
  );

const INT = { ability: 'intelligence', attackBonus: 6, saveDc: 14 } as const;
const CHA = { ability: 'charisma', attackBonus: 4, saveDc: 12 } as const;

describe('Spellcasting on the Spell List', () => {
  it('says how to add one when there is none', () => {
    renderWith([]);
    expect(screen.getByText('No spellcasting ability yet — tap “Add”.')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Add' })).toBeTruthy();
  });

  it('shows one chip per ability, in the order given, each named in full', () => {
    renderWith([INT, CHA]);
    const chips = screen.getAllByRole('button', { name: /spellcasting:/ });
    expect(chips.map((chip) => chip.getAttribute('aria-label'))).toEqual([
      'Intelligence spellcasting: attack +6, save DC 14',
      'Charisma spellcasting: attack +4, save DC 12',
    ]);
    expect(chips[0]?.textContent).toBe('INTAtk+6|DC14');
  });

  it('adds one ability first: used ones disabled, Create waiting for a pick', () => {
    const actions = spyActions();
    renderWith([INT, CHA], actions);
    fireEvent.click(screen.getByRole('button', { name: '+ Add' }));

    expect(screen.getByText('Add spellcasting')).toBeTruthy();
    expect((screen.getByRole('radio', { name: 'INT' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('radio', { name: 'CHA' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Intelligence already has an entry/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.queryByLabelText('Spell attack')).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'WIS' }));
    fireEvent.change(screen.getByLabelText('Spell attack'), { target: { value: '+4' } });
    fireEvent.change(screen.getByLabelText('Save DC'), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(actions.addSpellcasting).toHaveBeenCalledTimes(1);
    expect(actions.addSpellcasting).toHaveBeenCalledWith('wisdom', { attackBonus: 4, saveDc: 12 });
  });

  it('offers no Add once all six abilities have an entry', () => {
    const all = (
      ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const
    ).map((ability) => ({ ability, attackBonus: 1, saveDc: 10 }));
    renderWith(all);
    expect(screen.queryByRole('button', { name: '+ Add' })).toBeNull();
  });

  it('edits and deletes an entry from its chip', () => {
    const actions = spyActions();
    renderWith([INT], actions);
    fireEvent.click(screen.getByRole('button', { name: /^Intelligence spellcasting/ }));

    expect(screen.getByText('Intelligence')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Spell attack'), { target: { value: '+7' } });
    expect(actions.setSpellAttackBonus).toHaveBeenCalledWith('intelligence', 7);
    fireEvent.change(screen.getByLabelText('Save DC'), { target: { value: '15' } });
    expect(actions.setSpellSaveDc).toHaveBeenCalledWith('intelligence', 15);

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('dialog', { name: 'Delete?', hidden: true });
    expect(
      within(confirm).getByText(
        'Intelligence spellcasting will be deleted. This cannot be undone.',
      ),
    ).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete', hidden: true }));
    expect(actions.removeSpellcasting).toHaveBeenCalledWith('intelligence');
  });
});
