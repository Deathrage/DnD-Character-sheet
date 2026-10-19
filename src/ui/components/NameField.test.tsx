// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { NameField } from './NameField.js';

describe('NameField', () => {
  it('selects nothing on focus unless selectOnFocus is on', () => {
    render(<NameField label="Class" value="Rogue" onCommit={() => null} />);
    const input = screen.getByLabelText<HTMLInputElement>('Class');
    fireEvent.focus(input);
    expect(input.selectionStart).toBe(input.selectionEnd);
  });

  it('selects the whole name on focus when selectOnFocus is on', () => {
    render(<NameField label="Class" value="Rogue" onCommit={() => null} selectOnFocus />);
    const input = screen.getByLabelText<HTMLInputElement>('Class');
    fireEvent.focus(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 'Rogue'.length]);
  });
});
