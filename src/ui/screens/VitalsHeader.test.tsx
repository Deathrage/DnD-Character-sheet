// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { stubDialogElement } from '../../test/stubDialog.js';
import { blankCharacter, noVitalsActions, sable } from '../fixtures.js';
import { VitalsHeader } from './VitalsHeader.js';

beforeAll(stubDialogElement);
// The collapse is remembered app-wide, so one test's collapse would start the next one collapsed.
beforeEach(() => localStorage.clear());

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

  it('crops a picked image before storing it', async () => {
    const setPortrait = vi.fn(() => Promise.resolve(null));
    URL.createObjectURL = () => 'blob:picked';
    URL.revokeObjectURL = () => {};
    render(
      <VitalsHeader
        character={{ ...sable, portrait: null }}
        actions={{ ...noVitalsActions, setPortrait }}
        onBack={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add portrait' }));
    const file = new File(['x'], 'face.png', { type: 'image/png' });
    fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [file] } });

    const use = screen.getByRole('button', { name: 'Use image' }) as HTMLButtonElement;
    expect(use.disabled).toBe(true);
    const image = document.querySelector('.cropper img')!;
    Object.defineProperty(image, 'naturalWidth', { value: 400 });
    Object.defineProperty(image, 'naturalHeight', { value: 200 });
    fireEvent.load(image);
    fireEvent.change(screen.getByRole('slider', { name: 'Zoom' }), { target: { value: '2' } });
    fireEvent.click(use);

    expect(setPortrait).toHaveBeenCalledWith(file, { x: 150, y: 50, side: 100 });
    expect(await screen.findByRole('button', { name: 'Choose image' })).toBeTruthy();
  });

  it('offers only Choose image when there is no portrait', () => {
    header(null);
    fireEvent.click(screen.getByRole('button', { name: 'Add portrait' }));
    expect(screen.getByRole('button', { name: 'Choose image' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
  });
});

describe('VitalsHeader collapse', () => {
  it('swaps the tiles for a one-line summary and back', () => {
    header(null);
    fireEvent.click(screen.getByRole('button', { name: 'Collapse vitals' }));
    expect(screen.queryByLabelText('Current hit points')).toBeNull();
    expect(screen.queryByRole('button', { name: /Rogue/ })).toBeNull();
    expect(screen.getByText('Lvl 7 · HP 38/45 +5 · 2/2 d6 · 3/5 d8 · AC 15')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Expand vitals' }));
    expect(screen.getByLabelText('Current hit points')).toBeTruthy();
  });

  it('stays collapsed across a remount, whichever character opens next', () => {
    const { unmount } = render(
      <VitalsHeader character={sable} actions={noVitalsActions} onBack={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Collapse vitals' }));
    unmount();

    render(
      <VitalsHeader
        character={{ ...sable, id: 'another' }}
        actions={noVitalsActions}
        onBack={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Expand vitals' })).toBeTruthy();
  });
});

describe('VitalsHeader initiative', () => {
  it('sits beside armor class, signed, and writes through setInitiative', () => {
    const setInitiative = vi.fn();
    render(
      <VitalsHeader
        character={sable}
        actions={{ ...noVitalsActions, setInitiative }}
        onBack={() => {}}
      />,
    );
    const field = screen.getByLabelText('Initiative') as HTMLInputElement;
    expect(field.value).toBe('+3');
    fireEvent.change(field, { target: { value: '-1' } });
    expect(setInitiative).toHaveBeenCalledWith(-1);
  });

  it('takes the place of speed, which is edited on Abilities & Skills only', () => {
    header(null);
    expect(screen.queryByLabelText('Speed')).toBeNull();
  });
});

describe('VitalsHeader hit dice tile', () => {
  it('wraps only between dice: a no-break space inside each one', () => {
    header(null);
    const tile = screen.getByRole('button', { name: /^Hit Dice/ });
    expect(tile.textContent).toContain('2/2\u00a0d6 · 3/5\u00a0d8');
  });
});

describe('VitalsHeader classes', () => {
  it('shows the total level and class names, and the levels behind a tap', () => {
    header(null);
    const button = screen.getByRole('button', {
      name: /^Lvl 7\s*Rogue \(Arcane Trickster\) · Wizard \(Evoker\)/,
    });
    fireEvent.click(button);
    expect(
      (screen.getByLabelText('Level of Rogue (Arcane Trickster)') as HTMLInputElement).value,
    ).toBe('5');
  });

  it('steps a class level with − and +, never below 1', () => {
    const setClassLevel = vi.fn();
    const wizard = { id: 'c1', name: 'Wizard', level: 1 };
    render(
      <VitalsHeader
        character={{ ...sable, classes: [wizard], level: 1 }}
        actions={{ ...noVitalsActions, setClassLevel }}
        onBack={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^Lvl 1/ }));
    expect(screen.getByLabelText<HTMLButtonElement>('Decrease Level of Wizard').disabled).toBe(
      true,
    );
    fireEvent.click(screen.getByLabelText('Increase Level of Wizard'));
    expect(setClassLevel).toHaveBeenCalledWith('c1', 2);
  });
});

describe('VitalsHeader death saves', () => {
  const dying = (deathSaves = { successes: 0, failures: 0 }, current = 0) => ({
    ...sable,
    hitPoints: { ...sable.hitPoints, current, deathSaves },
  });

  function deathSaves(character: typeof sable, actions: Partial<typeof noVitalsActions> = {}) {
    render(
      <VitalsHeader
        character={character}
        actions={{ ...noVitalsActions, ...actions }}
        onBack={() => {}}
      />,
    );
  }

  const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;
  const ticks = (side: 'success' | 'failure') =>
    [1, 2, 3].map((index) => box(`Death save ${side} ${index}`).checked);

  it('are not there above 0 hit points with nothing ticked', () => {
    deathSaves(sable);
    expect(screen.queryByRole('group', { name: 'Death saves' })).toBeNull();
  });

  it('open at 0 hit points, inside the hit points tile, with nothing ticked', () => {
    deathSaves(dying());
    const group = screen.getByRole('group', { name: 'Death saves' });
    expect(group.closest('.tile.hp')).not.toBeNull();
    expect(ticks('success')).toEqual([false, false, false]);
    expect(ticks('failure')).toEqual([false, false, false]);
  });

  // The rule is exactly "current hit points are 0", so a character whose hit points were never
  // entered shows them too.
  it('open on a blank sheet as well, whose current hit points are 0', () => {
    deathSaves(blankCharacter);
    expect(screen.getByRole('group', { name: 'Death saves' })).toBeTruthy();
  });

  it('stay while any box is ticked, above 0 hit points too, so a tick is never hidden', () => {
    deathSaves(dying({ successes: 0, failures: 1 }, 12));
    expect(screen.getByRole('group', { name: 'Death saves' })).toBeTruthy();
    expect(ticks('failure')).toEqual([true, false, false]);
  });

  it('show each count ticked from the first box', () => {
    deathSaves(dying({ successes: 2, failures: 1 }));
    expect(ticks('success')).toEqual([true, true, false]);
    expect(ticks('failure')).toEqual([true, false, false]);
  });

  it('tick up to the box pressed', () => {
    const setDeathSaveSuccesses = vi.fn();
    const setDeathSaveFailures = vi.fn();
    deathSaves(dying(), { setDeathSaveSuccesses, setDeathSaveFailures });
    fireEvent.click(box('Death save success 2'));
    fireEvent.click(box('Death save failure 3'));
    expect(setDeathSaveSuccesses).toHaveBeenCalledWith(2);
    expect(setDeathSaveFailures).toHaveBeenCalledWith(3);
  });

  it('untick from the box pressed', () => {
    const setDeathSaveSuccesses = vi.fn();
    deathSaves(dying({ successes: 2, failures: 0 }), { setDeathSaveSuccesses });
    fireEvent.click(box('Death save success 2'));
    expect(setDeathSaveSuccesses).toHaveBeenLastCalledWith(1);
    fireEvent.click(box('Death save success 1'));
    expect(setDeathSaveSuccesses).toHaveBeenLastCalledWith(0);
  });

  it('clear both sides when the player presses Clear', () => {
    const clearDeathSaves = vi.fn();
    deathSaves(dying({ successes: 1, failures: 2 }), { clearDeathSaves });
    fireEvent.click(screen.getByRole('button', { name: 'Clear death saves' }));
    expect(clearDeathSaves).toHaveBeenCalledOnce();
  });

  it('offer no Clear while there is nothing to clear', () => {
    deathSaves(dying());
    const clear = screen.getByRole('button', { name: 'Clear death saves' }) as HTMLButtonElement;
    expect(clear.disabled).toBe(true);
  });

  // Not a rule: the app never plays the game for the player.
  it('never tick or clear anything themselves, at 0 hit points or on the way back up', () => {
    const setDeathSaveSuccesses = vi.fn();
    const setDeathSaveFailures = vi.fn();
    const clearDeathSaves = vi.fn();
    const setCurrentHitPoints = vi.fn();
    deathSaves(dying({ successes: 1, failures: 2 }), {
      setDeathSaveSuccesses,
      setDeathSaveFailures,
      clearDeathSaves,
      setCurrentHitPoints,
    });
    fireEvent.click(screen.getByLabelText('Increase Current hit points'));
    expect(setCurrentHitPoints).toHaveBeenCalledWith(1);
    expect(setDeathSaveSuccesses).not.toHaveBeenCalled();
    expect(setDeathSaveFailures).not.toHaveBeenCalled();
    expect(clearDeathSaves).not.toHaveBeenCalled();
  });

  it('are counted in the collapsed summary while they are open', () => {
    deathSaves(dying({ successes: 1, failures: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Collapse vitals' }));
    expect(
      screen.getByText('Lvl 7 · HP 0/45 +5 · Death ✓1 ✕2 · 2/2 d6 · 3/5 d8 · AC 15'),
    ).toBeTruthy();
  });
});
