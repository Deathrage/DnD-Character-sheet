// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { press } from '../../test/press.js';
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

  // `/^\d+$/` matches any run of digits, and `Number` rounds a long one to an integer the schema
  // cannot store. The setter refuses it, so it must not get there on a keystroke.
  it('does not call onChange for a whole number too large to store', () => {
    const onChange = vi.fn();
    render(<NumberField label="Gold" value={84} onChange={onChange} />);
    const input = screen.getByLabelText<HTMLInputElement>('Gold');

    fireEvent.change(input, { target: { value: String(Number.MAX_SAFE_INTEGER) } });
    fireEvent.change(input, { target: { value: '12345678901234567890' } });
    expect(onChange.mock.calls).toEqual([[Number.MAX_SAFE_INTEGER]]);
    // The typed text stays, as half-typed text does, until blur shows the stored value.
    expect(input.value).toBe('12345678901234567890');
  });

  it('does not call onChange for a signed number too large to store either way', () => {
    const onChange = vi.fn();
    render(<NumberField label="Modifier" value={0} onChange={onChange} signed />);
    const input = screen.getByLabelText('Modifier');

    fireEvent.change(input, { target: { value: '-12345678901234567890' } });
    fireEvent.change(input, { target: { value: '+12345678901234567890' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cannot step past the largest integer it can store', () => {
    const onChange = vi.fn();
    render(
      <NumberField label="Current" value={Number.MAX_SAFE_INTEGER} onChange={onChange} stepper />,
    );

    expect(screen.getByLabelText<HTMLButtonElement>('Increase Current').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Increase Current'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cannot step a signed field past the smallest integer it can store', () => {
    const onChange = vi.fn();
    render(
      <NumberField
        label="Modifier"
        value={-Number.MAX_SAFE_INTEGER}
        onChange={onChange}
        signed
        stepper
      />,
    );

    expect(screen.getByLabelText<HTMLButtonElement>('Decrease Modifier').disabled).toBe(true);
    fireEvent.click(screen.getByLabelText('Decrease Modifier'));
    expect(onChange).not.toHaveBeenCalled();
  });

  // v7's counters count in parts. The whole-number contract above still holds for every other
  // field: `decimal` is opt-in, so nothing else on the sheet starts accepting a fraction.
  describe('decimal', () => {
    it('accepts up to three decimal places, with a point or a comma', () => {
      const onChange = vi.fn();
      render(<NumberField label="Remaining" value={6} onChange={onChange} decimal />);
      const input = screen.getByLabelText('Remaining');

      fireEvent.change(input, { target: { value: '4' } });
      fireEvent.change(input, { target: { value: '4.' } });
      fireEvent.change(input, { target: { value: '4.5' } });
      fireEvent.change(input, { target: { value: '4,' } });
      fireEvent.change(input, { target: { value: '4,25' } });
      fireEvent.change(input, { target: { value: '.5' } });
      fireEvent.change(input, { target: { value: '0.125' } });
      fireEvent.change(input, { target: { value: '0.1255' } });

      expect(onChange.mock.calls).toEqual([[4], [4.5], [4.25], [0.125]]);
    });

    it('holds a half-typed fraction as a draft, and shows the stored value again after blur', () => {
      render(<NumberField label="Remaining" value={6} onChange={() => {}} decimal />);
      const input = screen.getByLabelText<HTMLInputElement>('Remaining');

      fireEvent.change(input, { target: { value: '4,' } });
      expect(input.value).toBe('4,');

      fireEvent.blur(input);
      expect(input.value).toBe('6');
    });

    it('shows a fraction with a point, and asks the keyboard for a decimal layout', () => {
      render(<NumberField label="Remaining" value={4.5} onChange={() => {}} decimal />);
      const input = screen.getByLabelText<HTMLInputElement>('Remaining');
      expect(input.value).toBe('4.5');
      expect(input.getAttribute('inputmode')).toBe('decimal');
    });

    it('does not accept a fraction when not decimal, which is every other field', () => {
      const onChange = vi.fn();
      render(<NumberField label="Gold" value={6} onChange={onChange} />);
      fireEvent.change(screen.getByLabelText('Gold'), { target: { value: '4,5' } });
      fireEvent.change(screen.getByLabelText('Gold'), { target: { value: '4.5' } });
      expect(onChange).not.toHaveBeenCalled();
    });

    it('never calls onChange below min, from typing or the stepper', () => {
      const onChange = vi.fn();
      render(
        <NumberField label="Step" value={0.001} min={0.001} onChange={onChange} decimal stepper />,
      );

      fireEvent.change(screen.getByLabelText('Step'), { target: { value: '0' } });
      fireEvent.change(screen.getByLabelText('Step'), { target: { value: '0.0005' } });
      expect(screen.getByLabelText<HTMLButtonElement>('Decrease Step').disabled).toBe(true);
      fireEvent.change(screen.getByLabelText('Step'), { target: { value: '0.5' } });

      expect(onChange.mock.calls).toEqual([[0.5]]);
    });
  });

  describe('step', () => {
    it('moves by the step, with no float residue', () => {
      const onChange = vi.fn();
      render(
        <NumberField label="Oil" value={0.2} onChange={onChange} decimal stepper step={0.1} />,
      );

      fireEvent.click(screen.getByLabelText('Increase Oil'));
      fireEvent.click(screen.getByLabelText('Decrease Oil'));

      // 0.2 + 0.1 is 0.30000000000000004 in floating point; the schema would refuse that.
      expect(onChange.mock.calls).toEqual([[0.3], [0.1]]);
    });

    it('steps a fraction back to a whole number', () => {
      const onChange = vi.fn();
      render(
        <NumberField label="Oil" value={4.5} onChange={onChange} decimal stepper step={0.5} />,
      );
      fireEvent.click(screen.getByLabelText('Decrease Oil'));
      expect(onChange).toHaveBeenCalledWith(4);
    });

    it('stops at min rather than stepping below it', () => {
      const onChange = vi.fn();
      render(
        <NumberField label="Oil" value={0.3} onChange={onChange} decimal stepper step={0.5} />,
      );
      fireEvent.click(screen.getByLabelText('Decrease Oil'));
      expect(onChange).toHaveBeenCalledWith(0);
    });

    it('is one when not given, so every other stepper is unchanged', () => {
      const onChange = vi.fn();
      render(<NumberField label="Current" value={38} onChange={onChange} stepper />);
      fireEvent.click(screen.getByLabelText('Increase Current'));
      expect(onChange).toHaveBeenCalledWith(39);
    });
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

  it('turns autofill off, signed or not', () => {
    // Both, because they differ in `inputMode`, and the signed one is where it was seen.
    render(
      <>
        <NumberField label="Score" value={10} onChange={() => {}} />
        <NumberField label="Modifier" value={0} onChange={() => {}} signed />
      </>,
    );

    expect(screen.getByLabelText('Score').getAttribute('autocomplete')).toBe('off');
    expect(screen.getByLabelText('Modifier').getAttribute('autocomplete')).toBe('off');
  });

  it('selects the whole value when a press focuses it, sign included, so typing replaces it', () => {
    render(<NumberField label="Initiative" value={3} onChange={() => {}} signed />);
    const input = screen.getByLabelText<HTMLInputElement>('Initiative');
    press(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, '+3'.length]);
  });

  it('leaves a press on a field that already has focus to place the caret', () => {
    render(<NumberField label="Current" value={38} onChange={() => {}} />);
    const input = screen.getByLabelText<HTMLInputElement>('Current');
    press(input);
    input.setSelectionRange(1, 1);
    press(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 1]);
  });

  it("selects nothing on focus alone: Tab is the browser's, and so is the window coming back", () => {
    render(<NumberField label="Current" value={38} onChange={() => {}} />);
    const input = screen.getByLabelText<HTMLInputElement>('Current');
    fireEvent.focus(input);
    expect(input.selectionStart).toBe(input.selectionEnd);
  });

  it('selects nothing when selectOnFocus is off', () => {
    render(<NumberField label="Current" value={38} onChange={() => {}} selectOnFocus={false} />);
    const input = screen.getByLabelText<HTMLInputElement>('Current');
    press(input);
    expect(input.selectionStart).toBe(input.selectionEnd);
  });
});
