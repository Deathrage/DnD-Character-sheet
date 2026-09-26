// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { abilitiesAndSkills, noAbilitiesActions } from '../fixtures.js';
import { AbilitiesAndSkills } from './AbilitiesAndSkills.js';

describe('AbilitiesAndSkills initiative', () => {
  it('shows the stored bonus signed and writes a negative one through setInitiative', () => {
    const setInitiative = vi.fn();
    render(
      <AbilitiesAndSkills
        data={abilitiesAndSkills}
        actions={{ ...noAbilitiesActions, setInitiative }}
        onClose={() => {}}
      />,
    );
    const field = screen.getByLabelText('Initiative') as HTMLInputElement;
    expect(field.value).toBe('+3');
    fireEvent.change(field, { target: { value: '-1' } });
    expect(setInitiative).toHaveBeenCalledWith(-1);
  });

  it('never shows the Dexterity modifier in its place', () => {
    // The fixture's Dexterity modifier is +3 too; a different stored value proves which one is read.
    render(
      <AbilitiesAndSkills
        data={{ ...abilitiesAndSkills, initiative: 7 }}
        actions={noAbilitiesActions}
        onClose={() => {}}
      />,
    );
    expect((screen.getByLabelText('Initiative') as HTMLInputElement).value).toBe('+7');
  });
});
