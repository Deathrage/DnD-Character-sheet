// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { AbilityPicker } from './AbilityPicker.js';
import type { AbilityKey } from '../types.js';

const radios = () => screen.getAllByRole('radio');
const checked = () =>
  radios()
    .filter((radio) => radio.getAttribute('aria-checked') === 'true')
    .map((radio) => radio.textContent);

describe('AbilityPicker', () => {
  it('is a radio group of the six abilities, STR to CHA, named by its label', () => {
    render(<AbilityPicker label="Ability" value={null} onChange={() => {}} />);
    expect(screen.getByRole('radiogroup', { name: 'Ability' })).toBeTruthy();
    expect(radios().map((radio) => radio.textContent)).toEqual([
      'STR',
      'DEX',
      'CON',
      'INT',
      'WIS',
      'CHA',
    ]);
  });

  it('offers None first only when allowed', () => {
    render(<AbilityPicker label="Attack ability" allowNone value={null} onChange={() => {}} />);
    expect(radios()[0]?.textContent).toBe('None');
    expect(radios()).toHaveLength(7);
  });

  it('checks exactly the current value, and None for null', () => {
    const { rerender } = render(
      <AbilityPicker label="Attack ability" allowNone value="dexterity" onChange={() => {}} />,
    );
    expect(checked()).toEqual(['DEX']);
    rerender(<AbilityPicker label="Attack ability" allowNone value={null} onChange={() => {}} />);
    expect(checked()).toEqual(['None']);
  });

  it('reports the key picked, and null for None', () => {
    const picked: (AbilityKey | null)[] = [];
    render(
      <AbilityPicker
        label="Attack ability"
        allowNone
        value="strength"
        onChange={(value) => picked.push(value)}
      />,
    );
    fireEvent.click(screen.getByRole('radio', { name: 'DEX' }));
    fireEvent.click(screen.getByRole('radio', { name: 'None' }));
    expect(picked).toEqual(['dexterity', null]);
  });

  it('disables the abilities it is told to, and a click on one reports nothing', () => {
    const picked: (AbilityKey | null)[] = [];
    render(
      <AbilityPicker
        label="Ability"
        value={null}
        disabled={['intelligence']}
        onChange={(value) => picked.push(value)}
      />,
    );
    const int = screen.getByRole('radio', { name: 'INT' });
    expect((int as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(int);
    expect(picked).toEqual([]);
  });
});
