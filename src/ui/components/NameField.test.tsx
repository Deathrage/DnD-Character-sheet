// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { press } from '../../test/press.js';
import { NameField } from './NameField.js';

describe('NameField', () => {
  it('selects nothing on a press unless selectOnFocus is on', () => {
    render(<NameField label="Class" value="Rogue" onCommit={() => null} />);
    const input = screen.getByLabelText<HTMLInputElement>('Class');
    press(input);
    expect(input.selectionStart).toBe(input.selectionEnd);
  });

  it('selects the whole name on a press when selectOnFocus is on', () => {
    render(<NameField label="Class" value="Rogue" onCommit={() => null} selectOnFocus />);
    const input = screen.getByLabelText<HTMLInputElement>('Class');
    press(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Rogue'.length]);
  });
});
