// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { NumberField } from './NumberField.js';

/**
 * These cover the contract `src/business/guards.ts` states from the other side: its setters
 * throw on a non-integer because they are a net for a UI bug, not input validation. So the one
 * thing that must hold here is that text on the way to being a number never reaches `onChange`.
 */
describe('NumberField', () => {
  it('does not call onChange for text that is not a whole number', () => {
    const onChange = vi.fn();
    render(<NumberField label="Current" value={38} onChange={onChange} />);
    const input = screen.getByLabelText('Current');

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.change(input, { target: { value: '4.' } });
    fireEvent.change(input, { target: { value: '4.5' } });
    fireEvent.change(input, { target: { value: '45' } });

    expect(onChange.mock.calls).toEqual([[4], [45]]);
  });

  it('shows the draft while typing, and the stored value again after blur', () => {
    // The parent ignores onChange, so `value` stays 38 — which is what a rejected or
    // uncommitted edit looks like from the field's point of view.
    render(<NumberField label="Current" value={38} onChange={() => {}} />);
    const input = screen.getByLabelText<HTMLInputElement>('Current');

    fireEvent.change(input, { target: { value: '' } });
    expect(input.value).toBe('');

    fireEvent.blur(input);
    expect(input.value).toBe('38');
  });

  it('never calls onChange below min, from typing or the stepper', () => {
    const onChange = vi.fn();
    render(<NumberField label="Level" value={1} min={1} stepper onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '0' } });
    expect(screen.getByLabelText<HTMLButtonElement>('Decrease Level').disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Level'), { target: { value: '2' } });

    expect(onChange.mock.calls).toEqual([[2]]);
  });

  it('refuses a negative unless the field is signed', () => {
    const onChange = vi.fn();
    render(<NumberField label="Score" value={10} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Score'), { target: { value: '-3' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('steps from the stored value, not from half-typed text', () => {
    const onChange = vi.fn();
    render(<NumberField label="Current" value={38} onChange={onChange} stepper />);

    // A draft that never parsed leaves `value` at 38, so the step must still start from 38.
    fireEvent.change(screen.getByLabelText('Current'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('Decrease Current'));
    fireEvent.click(screen.getByLabelText('Increase Current'));

    expect(onChange.mock.calls).toEqual([[37], [39]]);
  });

  it('cannot step an unsigned field below zero', () => {
    const onChange = vi.fn();
    render(<NumberField label="Current" value={0} onChange={onChange} stepper />);

    expect(screen.getByLabelText<HTMLButtonElement>('Decrease Current').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Decrease Current'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('has no stepper unless asked for one', () => {
    render(<NumberField label="Armor class" value={15} onChange={() => {}} />);
    expect(screen.queryByLabelText('Increase Armor class')).toBeNull();
  });

  it('renders and accepts an explicit sign when signed', () => {
    const onChange = vi.fn();
    render(<NumberField label="Modifier" value={0} onChange={onChange} signed />);
    const input = screen.getByLabelText<HTMLInputElement>('Modifier');

    expect(input.value).toBe('+0');

    fireEvent.change(input, { target: { value: '-' } });
    fireEvent.change(input, { target: { value: '-3' } });
    fireEvent.change(input, { target: { value: '+3' } });

    expect(onChange.mock.calls).toEqual([[-3], [3]]);
  });
});
