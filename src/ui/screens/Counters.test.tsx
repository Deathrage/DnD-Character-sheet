// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { vi } from 'vitest';
import { stubDialogElement } from '../../test/stubDialog.js';
import { counters, noCountersActions } from '../fixtures.js';
import type { CountersActions, CountersView, SpellSlotView } from '../types.js';
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

/**
 * A Counters whose actions really change what it renders, so a test can run a switch end to end:
 * turn it off, close the dialog, look at the sheet, open the dialog again. The spies cannot, which
 * is why a switch's effect once showed up only in pieces. Updates are functional because one
 * switch fires eighteen actions in a single handler.
 */
function StatefulCounters({ initial }: { initial: Partial<CountersView> }) {
  const [data, setData] = useState<CountersView>({ ...counters, ...initial });
  const setPact = (change: Partial<SpellSlotView>) =>
    setData((d) => ({ ...d, pactSlots: { ...d.pactSlots, ...change } }));
  const setSlot = (level: number, change: Partial<SpellSlotView>) =>
    setData((d) => ({
      ...d,
      spellSlots: d.spellSlots.map((slot) =>
        slot.level === level ? { ...slot, ...change } : slot,
      ),
    }));
  const actions: CountersActions = {
    ...noCountersActions,
    setPactSlotLevel: (level) => setPact({ level }),
    setPactSlotCurrent: (current) => setPact({ current }),
    setPactSlotTotal: (total) => setPact({ total }),
    setSpellSlotCurrent: (level, current) => setSlot(level, { current }),
    setSpellSlotTotal: (level, total) => setSlot(level, { total }),
  };
  return <Counters characterId="c" data={data} actions={actions} onClose={() => {}} />;
}

const closeDialog = () => fireEvent.click(screen.getByRole('button', { name: 'Close' }));

describe('Spell slots on Counters', () => {
  it('shows only a button when there are no slots of either kind', () => {
    renderWith({ spellSlots: NO_SLOTS, pactSlots: NO_PACT });
    expect(screen.getByRole('button', { name: 'Set spell slots' })).toBeTruthy();
    expect(screen.queryByText('Spell Slots')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit spell slots' })).toBeNull();
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
    expect(screen.getByRole('button', { name: 'Edit spell slots' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Set spell slots' })).toBeNull();
  });

  // Every non-warlock: ordinary slots in use and no pact slots. Two ways to get this wrong were
  // invisible without it: a pact row for everyone ('Pact 1st 0/0'), and a table that needs pact
  // slots to show at all.
  it('shows a non-warlock only the ordinary levels in use', () => {
    renderWith({});
    expect(remaining()).toEqual(['Level 1 slots remaining', 'Level 2 slots remaining']);
    expect(screen.queryByText(/^Pact/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit spell slots' })).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: 'Edit spell slots' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Edit spell slots' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Edit spell slots' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Edit spell slots' }));
    fireEvent.click(checkbox('Spell slots'));

    const allNine = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((level) => [level, 0]);
    expect(actions.setSpellSlotTotal.mock.calls).toEqual(allNine);
    expect(actions.setSpellSlotCurrent.mock.calls).toEqual(allNine);
    expect(actions.setPactSlotTotal).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Level 1 slot total' })).toBeNull();
  });
});

// A switch off must leave nothing of its kind on the sheet, and reopening must show it off; a
// switch on and left at 0 must change nothing at all. All three run against real state.
describe('The spell slots switches, end to end', () => {
  it('pact magic off: no pact row, the switch is off on reopening, and the level is kept', () => {
    render(<StatefulCounters initial={{ pactSlots: PACT }} />);
    expect(screen.getByText('Pact 3rd')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Edit spell slots' }));
    fireEvent.click(checkbox('Pact magic'));
    closeDialog();
    expect(screen.queryByText(/^Pact/)).toBeNull();
    expect(remaining()).toEqual(['Level 1 slots remaining', 'Level 2 slots remaining']);

    fireEvent.click(screen.getByRole('button', { name: 'Edit spell slots' }));
    expect(checkbox('Pact magic').checked).toBe(false);
    fireEvent.click(checkbox('Pact magic'));
    expect((screen.getByRole('combobox', { name: 'Level' }) as HTMLSelectElement).value).toBe('3');
  });

  it('spell slots off: no ordinary rows, and the switch is off on reopening', () => {
    render(<StatefulCounters initial={{ pactSlots: PACT }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit spell slots' }));
    fireEvent.click(checkbox('Spell slots'));
    closeDialog();
    expect(remaining()).toEqual(['Pact slots remaining']);

    fireEvent.click(screen.getByRole('button', { name: 'Edit spell slots' }));
    expect(checkbox('Spell slots').checked).toBe(false);
    expect(checkbox('Pact magic').checked).toBe(true);
  });

  it('pact magic on and left at 0: no row, only the button, and the switch is off again', () => {
    render(<StatefulCounters initial={{ spellSlots: NO_SLOTS, pactSlots: NO_PACT }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Set spell slots' }));
    fireEvent.click(checkbox('Pact magic'));
    expect(checkbox('Pact magic').checked).toBe(true);
    closeDialog();
    expect(screen.queryByText(/^Pact/)).toBeNull();
    expect(remaining()).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Edit spell slots' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Set spell slots' }));
    expect(checkbox('Pact magic').checked).toBe(false);
  });
});
