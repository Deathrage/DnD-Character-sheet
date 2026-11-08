// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { ABILITIES } from '../reference.js';
import { AbilityRow } from './AbilityRow.js';

const actions = {
  setAbilityScore() {},
  setAbilityModifier() {},
  setSavingThrowModifier() {},
  setSavingThrowProficient() {},
};
const value = { score: 1, modifier: -5, savingThrowModifier: -2 };

describe('AbilityRow', () => {
  it('has a P mark only when it is given saving throw proficiency', () => {
    const { container, rerender } = render(
      <AbilityRow ability={ABILITIES[0]} value={value} actions={actions} />,
    );
    expect(screen.queryByText('P')).toBeNull();
    expect(container.querySelector('.abrow.nomark')).not.toBeNull();

    rerender(
      <AbilityRow
        ability={ABILITIES[0]}
        value={{ ...value, savingThrowProficient: false }}
        actions={actions}
      />,
    );
    expect(screen.getByRole('button', { name: 'STR saving throw proficiency' })).toBeTruthy();
    expect(container.querySelector('.abrow.nomark')).toBeNull();
  });

  it('starts every label with the prefix', () => {
    render(
      <AbilityRow ability={ABILITIES[0]} value={value} actions={actions} labelPrefix="Vestige" />,
    );
    expect(screen.getByLabelText('Vestige STR score')).toBeTruthy();
    expect(screen.getByLabelText('Vestige STR modifier')).toBeTruthy();
    expect(screen.getByLabelText('Vestige STR saving throw')).toBeTruthy();
  });
});
