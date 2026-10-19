// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { NameField } from './NameField.js';

describe('NameField', () => {
  it('turns autofill off', () => {
    render(<NameField label="Name" value="Rogue" onCommit={() => null} />);
    expect(screen.getByLabelText('Name').getAttribute('autocomplete')).toBe('off');
  });
});
