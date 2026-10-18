// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { stubDialogElement } from '../../test/stubDialog.js';
import { counters, noCountersActions } from '../fixtures.js';
import type { CountersActions, CountersView } from '../types.js';
import { Counters } from './Counters.js';

beforeAll(stubDialogElement);
beforeEach(() => localStorage.clear());

/** Every action a spy, so a test can assert exactly what the screen asked for. */
const spyActions = () =>
  Object.fromEntries(
    Object.keys(noCountersActions).map((key) => [key, vi.fn(() => null)]),
  ) as unknown as { [K in keyof CountersActions]: ReturnType<typeof vi.fn> } & CountersActions;

const NO_SLOTS = counters.spellSlots.map((slot) => ({ ...slot, current: 0, total: 0 }));
const NO_PACT = { level: 1, current: 0, total: 0 };
const PACT = { level: 3, current: 1, total: 2 };

/** `counters` has 1st 4/4 and 2nd 1/2 and no pact slots; each test overrides what it needs. */
const renderWith = (data: Partial<CountersView>, actions: CountersActions = noCountersActions) =>
  render(
    <Counters
      characterId="c"
      data={{ ...counters, ...data }}
      actions={actions}
      onClose={() => {}}
    />,
  );

const remaining = () =>
  screen
    .queryAllByRole('textbox', { name: /slots remaining$/ })
    .map((input) => input.getAttribute('aria-label'));

const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

describe('Spell slots on Counters', () => {
  it('shows only a button when there are no slots of either kind', () => {
    renderWith({ spellSlots: NO_SLOTS, pactSlots: NO_PACT });
    expect(screen.getByRole('button', { name: 'Set spell slots' })).toBeTruthy();
    expect(screen.queryByText('Spell Slots')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByText(/No spell slots yet/)).toBeNull();
    expect(remaining()).toEqual([]);
  });

  it('lists the pact row first, then the ordinary levels in use', () => {
    renderWith({ pactSlots: PACT });
    expect(remaining()).toEqual([
      'Pact slots remaining',
      'Level 1 slots remaining',
      'Level 2 slots remaining',
    ]);
    expect(screen.getByText('Pact 3rd')).toBeTruthy();
    expect(screen.getByText('Spell Slots')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set spell slots' })).toBeNull();
  });

  it("shows a warlock's pact row alone", () => {
    renderWith({ spellSlots: NO_SLOTS, pactSlots: PACT });
    expect(remaining()).toEqual(['Pact slots remaining']);
  });

  it('ticks a pact slot off through its own action', () => {
    const actions = spyActions();
    renderWith({ pactSlots: PACT }, actions);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Pact slots remaining' }));
    expect(actions.setPactSlotCurrent).toHaveBeenCalledWith(0);
    expect(actions.setSpellSlotCurrent).not.toHaveBeenCalled();
  });
});

describe('The spell slots dialog', () => {
  it('opens each switch on when its kind has slots', () => {
    renderWith({ spellSlots: NO_SLOTS, pactSlots: PACT });
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    expect(checkbox('Pact magic').checked).toBe(true);
    expect(checkbox('Spell slots').checked).toBe(false);
    expect((screen.getByRole('combobox', { name: 'Level' }) as HTMLSelectElement).value).toBe('3');
    expect(screen.getByRole('textbox', { name: 'Pact slot total' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Level 1 slot total' })).toBeNull();
  });

  // A switch is never stored: one turned on and left at 0 is off again next time, because there
  // is nothing to say it was on.
  it('opens both switches off for a character with no slots', () => {
    renderWith({ spellSlots: NO_SLOTS, pactSlots: NO_PACT });
    fireEvent.click(screen.getByRole('button', { name: 'Set spell slots' }));

    expect(checkbox('Pact magic').checked).toBe(false);
    expect(checkbox('Spell slots').checked).toBe(false);
    expect(screen.queryByRole('combobox', { name: 'Level' })).toBeNull();
  });

  it('switching a kind on only shows its fields', () => {
    const actions = spyActions();
    renderWith({ spellSlots: NO_SLOTS, pactSlots: NO_PACT }, actions);
    fireEvent.click(screen.getByRole('button', { name: 'Set spell slots' }));
    fireEvent.click(checkbox('Pact magic'));
    fireEvent.click(checkbox('Spell slots'));

    expect(screen.getByRole('textbox', { name: 'Pact slot total' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Level 9 slot total' })).toBeTruthy();
    expect(screen.getByText('Set slots per level. 0 hides the level.')).toBeTruthy();
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });

  it('sets the pact level and the number of pact slots', () => {
    const actions = spyActions();
    renderWith({ pactSlots: PACT }, actions);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

    const level = screen.getByRole('combobox', { name: 'Level' }) as HTMLSelectElement;
    expect(Array.from(level.options).map((option) => option.textContent)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '5th',
      '6th',
      '7th',
      '8th',
      '9th',
    ]);
    fireEvent.change(level, { target: { value: '5' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Pact slot total' }), {
      target: { value: '3' },
    });

    expect(actions.setPactSlotLevel).toHaveBeenCalledWith(5);
    expect(actions.setPactSlotTotal).toHaveBeenCalledWith(3);
  });

  it('switching pact magic off zeroes its slots and leaves its level', () => {
    const actions = spyActions();
    renderWith({ pactSlots: PACT }, actions);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(checkbox('Pact magic'));

    expect(actions.setPactSlotTotal).toHaveBeenCalledWith(0);
    expect(actions.setPactSlotCurrent).toHaveBeenCalledWith(0);
    expect(actions.setPactSlotLevel).not.toHaveBeenCalled();
    expect(actions.setSpellSlotTotal).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox', { name: 'Level' })).toBeNull();
  });

  it('switching spell slots off zeroes all nine levels and nothing else', () => {
    const actions = spyActions();
    renderWith({ pactSlots: PACT }, actions);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(checkbox('Spell slots'));

    const allNine = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => [level, 0]);
    expect(actions.setSpellSlotTotal.mock.calls).toEqual(allNine);
    expect(actions.setSpellSlotCurrent.mock.calls).toEqual(allNine);
    expect(actions.setPactSlotTotal).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Level 1 slot total' })).toBeNull();
  });
});
