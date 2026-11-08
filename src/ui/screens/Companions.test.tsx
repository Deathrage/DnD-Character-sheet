// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { spyActions } from '../../test/spyActions.js';
import { stubDialogElement } from '../../test/stubDialog.js';
import { companions, noCompanionsActions } from '../fixtures.js';
import { ABILITIES } from '../reference.js';
import type { CompanionView } from '../types.js';
import { Companions } from './Companions.js';

/** Every render of the tiles, by the companion they belong to: the memo test's whole measure. */
const tilesRendered = vi.hoisted(() => vi.fn<(prefix: string | undefined) => void>());
vi.mock('../components/VitalTiles.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../components/VitalTiles.js')>();
  return {
    ...original,
    VitalTiles: (props: Parameters<typeof original.VitalTiles>[0]) => {
      tilesRendered(props.labelPrefix);
      return <original.VitalTiles {...props} />;
    },
  };
});

beforeAll(stubDialogElement);
beforeEach(() => localStorage.clear());

const [vestige, owl] = companions as [CompanionView, CompanionView];

const renderWith = (
  data: CompanionView[] = companions,
  actions = spyActions(noCompanionsActions),
  characterId = 'c',
) => {
  const screenFor = (next: CompanionView[]) => (
    <Companions characterId={characterId} data={next} actions={actions} onClose={() => {}} />
  );
  const result = render(screenFor(data));
  return {
    ...result,
    actions,
    rerenderWith: (next: CompanionView[]) => result.rerender(screenFor(next)),
  };
};

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const textbox = (name: string) => screen.getByRole('textbox', { name });
const checkbox = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
const expanded = (name: string) => button(name).getAttribute('aria-expanded');
const click = (name: string | RegExp) => fireEvent.click(button(name));

describe('Companions', () => {
  it('shows each companion folded, with its HP in the heading', () => {
    renderWith();
    expect(expanded('Vestige 9/16')).toBe('false');
    expect(expanded('Owl 0/1')).toBe('false');
    expect(screen.queryByRole('textbox', { name: 'Vestige current hit points' })).toBeNull();
  });

  it('opens a companion with its tiles, abilities, stat block and counters in that order', () => {
    renderWith();
    click('Vestige 9/16');

    expect(expanded('Vestige 9/16')).toBe('true');
    const inOrder = [
      textbox('Vestige current hit points'),
      button('Vestige abilities'),
      textbox('Vestige STR score'),
      textbox('Vestige CHA saving throw'),
      button('Vestige stat block'),
      textbox('Vestige stat block'),
      button('Vestige counters'),
      button('Vestige Divine Power'),
    ];
    inOrder
      .slice(1)
      .forEach((element, index) =>
        expect(inOrder[index]!.compareDocumentPosition(element)).toBe(
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      );
    // The three sub-sections start open; the other companion stays folded.
    for (const name of ['Vestige abilities', 'Vestige stat block', 'Vestige counters'])
      expect(expanded(name)).toBe('true');
    expect(screen.queryByRole('textbox', { name: 'Owl current hit points' })).toBeNull();
    // No proficiency mark: a companion's save is a box like its score and modifier.
    expect(screen.queryByRole('checkbox', { name: /proficiency/ })).toBeNull();
  });

  it('folds two companions with the same name separately', () => {
    renderWith([
      { ...vestige, id: 's1', name: 'Skeleton' },
      { ...vestige, id: 's2', name: 'Skeleton' },
    ]);
    const [first, second] = screen.getAllByRole('button', { name: 'Skeleton 9/16' });
    fireEvent.click(first!);

    expect(first!.getAttribute('aria-expanded')).toBe('true');
    expect(second!.getAttribute('aria-expanded')).toBe('false');
    expect(screen.getAllByRole('textbox', { name: 'Skeleton current hit points' })).toHaveLength(1);
  });

  // The second of the two, because a lookup by name finds the first.
  it('steps and edits the companion it belongs to when two share a name', () => {
    const { actions } = renderWith([
      { ...vestige, id: 's1', name: 'Skeleton' },
      { ...vestige, id: 's2', name: 'Skeleton' },
    ]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Skeleton 9/16' })[1]!);
    // The last stepper is the second's whichever are open, so this asks only who it writes to.
    const steppers = screen.getAllByRole('button', {
      name: 'Increase Skeleton current hit points',
    });
    fireEvent.click(steppers.at(-1)!);
    expect(actions.setCompanionCurrentHitPoints).toHaveBeenCalledExactlyOnceWith('s2', 10);

    fireEvent.click(screen.getAllByRole('button', { name: 'Edit companion Skeleton' })[1]!);
    fireEvent.change(textbox('Companion name'), { target: { value: 'Zombie' } });
    fireEvent.blur(textbox('Companion name'));
    expect(actions.renameCompanion).toHaveBeenCalledExactlyOnceWith('s2', 'Zombie');
  });

  it('remembers a fold for the same character only', () => {
    const { unmount } = renderWith(companions, undefined, 'c');
    click('Vestige 9/16');
    click('Vestige abilities');
    unmount();

    // A clone keeps its companion ids, so the key has to carry the character.
    const other = renderWith(companions, undefined, 'clone');
    expect(expanded('Vestige 9/16')).toBe('false');
    other.unmount();

    renderWith(companions, undefined, 'c');
    expect(expanded('Vestige 9/16')).toBe('true');
    expect(expanded('Vestige abilities')).toBe('false');
    expect(screen.queryByRole('textbox', { name: 'Vestige STR score' })).toBeNull();
    expect(expanded('Vestige stat block')).toBe('true');
  });

  it('opens a companion just created', () => {
    const actions = spyActions(noCompanionsActions);
    actions.addCompanion.mockReturnValue({ ok: true, id: 'new' });
    const { rerenderWith } = renderWith(companions, actions);

    click('+ New companion');
    fireEvent.change(textbox('Companion name'), { target: { value: 'Imp' } });
    click('+ Create');

    expect(actions.addCompanion).toHaveBeenCalledWith('Imp');
    expect(screen.queryByRole('dialog', { name: 'New companion' })).toBeNull();
    rerenderWith([...companions, { ...owl, id: 'new', name: 'Imp' }]);
    expect(expanded('Imp 0/1')).toBe('true');
    expect(expanded('Owl 0/1')).toBe('false');
  });

  it('keeps the new companion dialog open with the reason a name was refused', () => {
    const actions = spyActions(noCompanionsActions);
    actions.addCompanion.mockReturnValue({ ok: false, message: 'Give it a name.' });
    renderWith(companions, actions);

    click('+ New companion');
    fireEvent.change(textbox('Companion name'), { target: { value: 'Imp' } });
    click('+ Create');

    expect(screen.getByRole('alert').textContent).toBe('Give it a name.');
    expect(screen.getByRole('dialog', { name: 'New companion' })).toBeTruthy();
  });

  it('shows Uses yours and No hit dices when switched off, with no input or button', () => {
    renderWith();
    click('Vestige 9/16');
    click('Owl 0/1');

    // The Vestige uses the character's initiative; the Owl has no hit dice.
    expect(screen.getAllByText('Uses yours')).toHaveLength(1);
    expect(screen.queryByRole('textbox', { name: 'Vestige initiative' })).toBeNull();
    expect(textbox('Owl initiative')).toBeTruthy();
    expect(screen.getAllByText('No hit dices')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Owl Hit Dices/ })).toBeNull();
    expect(button(/^Vestige Hit Dices 2\/3\sd6$/)).toBeTruthy();
  });

  describe('the Companion dialog', () => {
    it('switches call their setters on change only', () => {
      const { actions, rerenderWith } = renderWith();
      click('Edit companion Vestige');
      expect(checkbox('Rolls initiative').checked).toBe(false);
      expect(checkbox('Hit Dices').checked).toBe(true);
      // A fresh view of the same companion re-renders the open dialog, which must write nothing.
      rerenderWith([{ ...vestige }, owl]);
      click('Close');
      expect(actions.setCompanionRollsInitiative).not.toHaveBeenCalled();
      expect(actions.setCompanionHasHitDices).not.toHaveBeenCalled();

      click('Edit companion Vestige');
      fireEvent.click(checkbox('Rolls initiative'));
      expect(actions.setCompanionRollsInitiative).toHaveBeenCalledTimes(1);
      expect(actions.setCompanionRollsInitiative).toHaveBeenCalledWith('cp1', true);
      expect(actions.setCompanionHasHitDices).not.toHaveBeenCalled();
    });

    it('asks before deleting a companion', () => {
      const { actions } = renderWith();
      click('Edit companion Owl');
      click('Delete companion');
      expect(actions.removeCompanion).not.toHaveBeenCalled();
      expect(screen.getByText(/^The companion Owl will be deleted/)).toBeTruthy();

      click('Delete');
      expect(actions.removeCompanion).toHaveBeenCalledWith('cp2');
    });
  });

  it('names every control after its companion', () => {
    renderWith();
    click('Vestige 9/16');
    click('Owl 0/1');

    const fields = [
      'Vestige current hit points',
      'Vestige total hit points',
      'Vestige temporary hit points',
      'Vestige armor class',
      'Owl initiative',
      ...ABILITIES.flatMap(({ short }) => [
        `Vestige ${short} score`,
        `Vestige ${short} modifier`,
        `Vestige ${short} saving throw`,
      ]),
      'Vestige stat block',
      'Vestige Divine Power remaining',
    ];
    for (const name of fields) expect(textbox(name)).toBeTruthy();
    const buttons = [
      'Vestige 9/16',
      'Edit companion Vestige',
      'Decrease Vestige current hit points',
      'Increase Vestige temporary hit points',
      'Vestige abilities',
      'Vestige stat block',
      'Vestige counters',
      'Add counter to Vestige',
      'Vestige Divine Power',
      'Decrease Vestige Divine Power remaining',
    ];
    for (const name of buttons) expect(button(name)).toBeTruthy();
  });

  it("titles the hit dice dialog with the companion's name", () => {
    const { actions } = renderWith();
    click('Vestige 9/16');
    click(/^Vestige Hit Dices/);

    expect(screen.getByRole('dialog', { name: 'Vestige: Hit Dices' })).toBeTruthy();
    fireEvent.change(textbox('New die size'), { target: { value: '8' } });
    click('+ Add die type');
    expect(actions.addCompanionHitDie).toHaveBeenCalledWith('cp1', 8);
  });

  it('adds and edits counters on their own companion, with no category picker', () => {
    const { actions, rerenderWith } = renderWith();
    click('Vestige 9/16');

    click('Add counter to Vestige');
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.change(textbox('Name'), { target: { value: 'Rot' } });
    click('Create');
    expect(actions.addCompanionCounter).toHaveBeenCalledWith('cp1', {
      name: 'Rot',
      description: '',
      total: 1,
      step: 1,
    });

    click('Vestige Divine Power');
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.change(textbox('Note'), { target: { value: 'By form.' } });
    expect(actions.setCompanionCounterDescription).toHaveBeenCalledWith('cp1', 'cpc1', 'By form.');

    // A counter deleted elsewhere takes its open dialog with it.
    rerenderWith([{ ...vestige, counters: [] }, owl]);
    expect(screen.queryByRole('dialog', { name: 'Edit counter' })).toBeNull();
  });

  it('re-renders only the companion whose hit points changed', () => {
    const { rerenderWith } = renderWith();
    click('Vestige 9/16');
    click('Owl 0/1');
    tilesRendered.mockClear();

    rerenderWith([vestige, { ...owl, hitPoints: { ...owl.hitPoints, current: 1 } }]);
    expect(tilesRendered.mock.calls).toEqual([['Owl']]);
  });
});
