// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { stubDialogElement } from '../../test/stubDialog.js';
import { noVitalsActions, sable } from '../fixtures.js';
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

describe('VitalsHeader speed', () => {
  it('sits beside armor class and writes through setSpeed', () => {
    const setSpeed = vi.fn();
    render(
      <VitalsHeader
        character={sable}
        actions={{ ...noVitalsActions, setSpeed }}
        onBack={() => {}}
      />,
    );
    const field = screen.getByLabelText('Speed') as HTMLInputElement;
    expect(field.value).toBe('30');
    fireEvent.change(field, { target: { value: '25' } });
    expect(setSpeed).toHaveBeenCalledWith(25);
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
