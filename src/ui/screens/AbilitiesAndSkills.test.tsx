// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { abilitiesAndSkills, noAbilitiesActions } from '../fixtures.js';
import { AbilitiesAndSkills } from './AbilitiesAndSkills.js';

beforeEach(() => localStorage.clear());

const screenFor = (characterId: string) =>
  render(
    <AbilitiesAndSkills
      characterId={characterId}
      data={abilitiesAndSkills}
      actions={noAbilitiesActions}
      onClose={() => {}}
    />,
  );

describe('AbilitiesAndSkills', () => {
  it('has no initiative field: it is edited in the vitals header only', () => {
    screenFor('c');
    expect(screen.getByLabelText('Speed')).toBeTruthy();
    expect(screen.queryByLabelText('Initiative')).toBeNull();
  });

  it('starts both blocks open', () => {
    screenFor('c');
    expect(screen.getByRole('button', { name: /^Abilities/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: /^Skills/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
    expect(screen.getByLabelText('STR score')).toBeTruthy();
    expect(screen.getByLabelText('Acrobatics modifier')).toBeTruthy();
  });

  it('folds Abilities and Skills separately', () => {
    screenFor('c');
    fireEvent.click(screen.getByRole('button', { name: /^Abilities/ }));
    expect(screen.queryByLabelText('STR score')).toBeNull();
    expect(screen.getByLabelText('Acrobatics modifier')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Skills/ }));
    expect(screen.queryByLabelText('Acrobatics modifier')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Abilities/ }));
    expect(screen.getByLabelText('STR score')).toBeTruthy();
  });

  it('remembers a fold for the same character only', () => {
    const { unmount } = screenFor('c');
    fireEvent.click(screen.getByRole('button', { name: /^Skills/ }));
    unmount();

    const other = screenFor('another');
    expect(screen.getByLabelText('Acrobatics modifier')).toBeTruthy();
    other.unmount();

    screenFor('c');
    expect(screen.queryByLabelText('Acrobatics modifier')).toBeNull();
  });

  it('keeps Prof. Bonus, Passive Perc. and Speed outside the folds', () => {
    screenFor('c');
    fireEvent.click(screen.getByRole('button', { name: /^Abilities/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Skills/ }));
    expect(screen.getByLabelText('Proficiency bonus')).toBeTruthy();
    expect(screen.getByLabelText('Passive perception')).toBeTruthy();
    expect(screen.getByLabelText('Speed')).toBeTruthy();
  });
});
