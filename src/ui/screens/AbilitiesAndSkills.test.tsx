// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { abilitiesAndSkills, noAbilitiesActions } from '../fixtures.js';
import { AbilitiesAndSkills } from './AbilitiesAndSkills.js';

describe('AbilitiesAndSkills', () => {
  it('has no initiative field: it is edited in the vitals header only', () => {
    render(
      <AbilitiesAndSkills
        data={abilitiesAndSkills}
        actions={noAbilitiesActions}
        onClose={() => {}}
      />,
    );
    expect(screen.getByLabelText('Speed')).toBeTruthy();
    expect(screen.queryByLabelText('Initiative')).toBeNull();
  });
});
