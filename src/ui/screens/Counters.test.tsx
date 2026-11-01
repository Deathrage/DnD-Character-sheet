// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { createCharacterSheet, type CharacterSheetBO } from '../../business/index.js';
import { spyActions } from '../../test/spyActions.js';
import { stubDialogElement } from '../../test/stubDialog.js';
import { useSheet } from '../bind.js';
import { counters, noCountersActions } from '../fixtures.js';
import type { CountersActions, CountersView } from '../types.js';
import { Counters } from './Counters.js';

beforeAll(stubDialogElement);
beforeEach(() => localStorage.clear());

const NO_SLOTS = counters.spellSlots.map((slot) => ({ ...slot, current: 0, total: 0 }));
const NO_PACT = { level: 1, current: 0, total: 0 };
const PACT = { level: 3, current: 1, total: 2 };
/**
 * The fixture's counter that counts in parts (4.5 of 6 by 0.5), moved to Uncategorized so its
 * row is on screen without a click: categories start collapsed.
 */
const OIL = { ...counters.categories[1]!.items[1]!, id: 'oil' };

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
const levelSelect = () => screen.getByRole('combobox', { name: 'Level' }) as HTMLSelectElement;
const openSlots = (name = 'Edit spell slots') =>
  fireEvent.click(screen.getByRole('button', { name }));
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
    const actions = spyActions(noCountersActions);
    renderWith({ pactSlots: PACT }, actions);
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Pact slots remaining' }));
    expect(actions.setPactSlotCurrent).toHaveBeenCalledWith(0);
    expect(actions.setSpellSlotCurrent).not.toHaveBeenCalled();
  });
});

describe('The spell slots dialog', () => {
  it('opens each switch on when its kind has slots', () => {
    renderWith({ spellSlots: NO_SLOTS, pactSlots: PACT });
    openSlots();

    expect(checkbox('Pact magic').checked).toBe(true);
    expect(checkbox('Spell slots').checked).toBe(false);
    expect(levelSelect().value).toBe('3');
    expect(screen.getByRole('textbox', { name: 'Pact slot total' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Level 1 slot total' })).toBeNull();
  });

  // A switch is never stored: one turned on and left at 0 is off again next time, because there
  // is nothing to say it was on.
  it('opens both switches off for a character with no slots', () => {
    renderWith({ spellSlots: NO_SLOTS, pactSlots: NO_PACT });
    openSlots('Set spell slots');

    expect(checkbox('Pact magic').checked).toBe(false);
    expect(checkbox('Spell slots').checked).toBe(false);
    expect(screen.queryByRole('combobox', { name: 'Level' })).toBeNull();
  });

  it('switching a kind on only shows its fields', () => {
    const actions = spyActions(noCountersActions);
    renderWith({ spellSlots: NO_SLOTS, pactSlots: NO_PACT }, actions);
    openSlots('Set spell slots');
    fireEvent.click(checkbox('Pact magic'));
    fireEvent.click(checkbox('Spell slots'));

    expect(screen.getByRole('textbox', { name: 'Pact slot total' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Level 9 slot total' })).toBeTruthy();
    expect(screen.getByText('Set slots per level. 0 hides the level.')).toBeTruthy();
    for (const action of Object.values(actions)) expect(action).not.toHaveBeenCalled();
  });

  it('sets the pact level and the number of pact slots', () => {
    const actions = spyActions(noCountersActions);
    renderWith({ pactSlots: PACT }, actions);
    openSlots();

    expect(Array.from(levelSelect().options).map((option) => option.textContent)).toEqual([
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
    fireEvent.change(levelSelect(), { target: { value: '5' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Pact slot total' }), {
      target: { value: '3' },
    });

    expect(actions.setPactSlotLevel).toHaveBeenCalledWith(5);
    expect(actions.setPactSlotTotal).toHaveBeenCalledWith(3);
  });
});

describe('A counter that counts in parts', () => {
  it('shows its fraction and steps by its own step, with no float residue', () => {
    const actions = spyActions(noCountersActions);
    renderWith({ uncategorized: [OIL] }, actions);
    const remaining = screen.getByRole('textbox', { name: 'Lantern oil (hours) remaining' });
    expect((remaining as HTMLInputElement).value).toBe('4.5');
    expect(screen.getByText('/ 6')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Decrease Lantern oil (hours) remaining' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase Lantern oil (hours) remaining' }));
    expect(actions.setCounterCurrent.mock.calls).toEqual([
      ['oil', 4],
      ['oil', 5],
    ]);
  });

  it('takes a fraction typed into the row, with a comma too', () => {
    const actions = spyActions(noCountersActions);
    renderWith({ uncategorized: [OIL] }, actions);
    fireEvent.change(screen.getByRole('textbox', { name: 'Lantern oil (hours) remaining' }), {
      target: { value: '4,25' },
    });
    expect(actions.setCounterCurrent).toHaveBeenCalledWith('oil', 4.25);
  });

  // A counter at step 1 is every counter from before v7, and must still move by one.
  it('steps a whole-number counter by one', () => {
    const actions = spyActions(noCountersActions);
    renderWith(
      { uncategorized: [{ ...OIL, id: 'rage', name: 'Rage', current: 2, step: 1 }] },
      actions,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Decrease Rage remaining' }));
    expect(actions.setCounterCurrent).toHaveBeenCalledWith('rage', 1);
  });

  it('is created with a step, 1 unless the player sets one', () => {
    const actions = spyActions(noCountersActions);
    renderWith({}, actions);
    fireEvent.click(screen.getByRole('button', { name: 'Add entry to Uncategorized' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: 'Rations (days)' },
    });
    expect((screen.getByRole('textbox', { name: 'Step' }) as HTMLInputElement).value).toBe('1');
    expect(screen.getByText(/move it by the step/)).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Total' }), { target: { value: '10' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Step' }), { target: { value: '0.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(actions.addCounter).toHaveBeenCalledWith(null, {
      name: 'Rations (days)',
      description: '',
      total: 10,
      step: 0.5,
    });
  });

  it('never passes a step of 0 on, from the new or the edit dialog', () => {
    const actions = spyActions(noCountersActions);
    renderWith({ uncategorized: [OIL] }, actions);
    fireEvent.click(screen.getByRole('button', { name: /^Lantern oil/ }));
    const step = screen.getByRole('textbox', { name: 'Step' }) as HTMLInputElement;
    expect(step.value).toBe('0.5');

    fireEvent.change(step, { target: { value: '0' } });
    fireEvent.change(step, { target: { value: '0.25' } });
    expect(actions.setCounterStep.mock.calls).toEqual([['oil', 0.25]]);
  });

  it('edits the fraction and total from the edit dialog', () => {
    const actions = spyActions(noCountersActions);
    renderWith({ uncategorized: [OIL] }, actions);
    fireEvent.click(screen.getByRole('button', { name: /^Lantern oil/ }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Remaining' }), {
      target: { value: '3.5' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Total' }), { target: { value: '6.5' } });
    expect(actions.setCounterCurrent).toHaveBeenCalledWith('oil', 3.5);
    expect(actions.setCounterTotal).toHaveBeenCalledWith('oil', 6.5);
  });
});

/** Counters over a real sheet, bound the way the app binds it. */
function Bound({ sheet }: { sheet: CharacterSheetBO }) {
  const { data, actions } = useSheet(sheet);
  return (
    <Counters characterId="c" data={data.counters} actions={actions.counters} onClose={() => {}} />
  );
}

/**
 * Ordinary slots 1st 4/4 and 2nd 1/2, and pact slots 3rd 1/2, each when asked for. The ordinary
 * ones include a hidden 3rd level at 2 of 0 — the app never clamps remaining to the total — so a
 * switch that zeroed only the levels on show would leave it behind and be caught.
 */
function sheetWith({ ordinary, pact }: { ordinary: boolean; pact: boolean }): CharacterSheetBO {
  const sheet = createCharacterSheet('Sable');
  if (ordinary) {
    const [first, second, third] = sheet.counters.spellSlots;
    first?.setTotal(4);
    first?.setCurrent(4);
    second?.setTotal(2);
    second?.setCurrent(1);
    third?.setCurrent(2);
  }
  if (pact) {
    sheet.counters.pactSlots.setLevel(3);
    sheet.counters.pactSlots.setTotal(2);
    sheet.counters.pactSlots.setCurrent(1);
  }
  return sheet;
}

const stored = (sheet: CharacterSheetBO) => sheet.toDocument().counters;

// A switch off must leave nothing of its kind on the sheet or in the document, and reopening must
// show it off; a switch on and left at 0 must change nothing at all.
describe('The spell slots switches, end to end', () => {
  it('pact magic off: no pact row, 0 slots stored with the level kept, the switch off again', () => {
    const sheet = sheetWith({ ordinary: true, pact: true });
    const before = stored(sheet);
    render(<Bound sheet={sheet} />);
    expect(screen.getByText('Pact 3rd')).toBeTruthy();

    openSlots();
    fireEvent.click(checkbox('Pact magic'));
    expect(screen.queryByRole('combobox', { name: 'Level' })).toBeNull();
    closeDialog();
    expect(screen.queryByText(/^Pact/)).toBeNull();
    expect(remaining()).toEqual(['Level 1 slots remaining', 'Level 2 slots remaining']);
    expect(stored(sheet).pactSlots).toEqual({ level: 3, current: 0, total: 0 });
    // A multiclass player's ordinary slots are not the pact switch's to touch.
    expect(stored(sheet).spellSlots).toEqual(before.spellSlots);

    openSlots();
    expect(checkbox('Pact magic').checked).toBe(false);
    fireEvent.click(checkbox('Pact magic'));
    expect(levelSelect().value).toBe('3');
  });

  it('spell slots off: no ordinary rows, all nine stored as 0, the switch off again', () => {
    const sheet = sheetWith({ ordinary: true, pact: true });
    render(<Bound sheet={sheet} />);

    openSlots();
    fireEvent.click(checkbox('Spell slots'));
    expect(screen.queryByRole('textbox', { name: 'Level 1 slot total' })).toBeNull();
    closeDialog();
    expect(remaining()).toEqual(['Pact slots remaining']);
    expect(Object.values(stored(sheet).spellSlots)).toEqual(
      Array.from({ length: 9 }, () => ({ current: 0, total: 0 })),
    );
    expect(stored(sheet).pactSlots).toEqual({ level: 3, current: 1, total: 2 });

    openSlots();
    expect(checkbox('Spell slots').checked).toBe(false);
    expect(checkbox('Pact magic').checked).toBe(true);
  });

  it('pact magic on and left at 0: nothing stored, only the button, the switch off again', () => {
    const sheet = sheetWith({ ordinary: false, pact: false });
    const before = stored(sheet);
    render(<Bound sheet={sheet} />);

    openSlots('Set spell slots');
    fireEvent.click(checkbox('Pact magic'));
    expect(checkbox('Pact magic').checked).toBe(true);
    closeDialog();
    expect(remaining()).toEqual([]);
    expect(screen.queryByRole('button', { name: 'Edit spell slots' })).toBeNull();
    expect(stored(sheet)).toEqual(before);

    openSlots('Set spell slots');
    expect(checkbox('Pact magic').checked).toBe(false);
  });
});
