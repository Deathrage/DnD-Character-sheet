import { useState } from 'react';

interface Props {
  label: string;
  value: number;
  onChange(value: number): void;
  /** Renders and accepts an explicit `+`/`-`, per `Model.ts`. Also permits a negative value. */
  signed?: boolean;
  /**
   * Adds a −/+ pair around the box. Opt-in, not the default: it costs about 60px of row width,
   * which is worth it for a number you tap at over and over — current HP, a hit die you spend —
   * and pure clutter on one you set once a level, like max HP or AC.
   */
  stepper?: boolean;
  /** The lowest value an unsigned field accepts; typed text below it never reaches `onChange`. */
  min?: number;
  className?: string;
}

/**
 * A numeric input that keeps half-typed text to itself.
 *
 * This is the UI half of a contract the business layer states in `guards.ts`: its setters throw
 * `NOT_AN_INTEGER` / `NEGATIVE` on bad input because they are a net for a UI bug, not input
 * validation. So `onChange` fires only for text that is a whole number — an empty box, a lone
 * `-`, or `1e3` are all normal keystrokes on the way somewhere, and none of them may reach a
 * setter.
 *
 * The draft is discarded on blur rather than kept, so the field re-renders from the value that
 * was actually stored. Clearing the box and tabbing away therefore restores the old number
 * instead of silently writing a zero.
 */
export function NumberField({
  label,
  value,
  onChange,
  signed = false,
  stepper = false,
  className = 'num',
  min = 0,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);

  /**
   * Steps from `value`, never from the draft text. A tap is a committed number, so it starts
   * from the number that is actually stored: if the box currently holds a half-typed `4` on the
   * way to `45`, `value` is already 4 — and if it holds something unparseable, `value` is still
   * the last good one. Dropping the draft afterwards is what makes the new number appear.
   */
  const step = (delta: number) => {
    setDraft(null);
    onChange(signed ? value + delta : Math.max(min, value + delta));
  };

  const input = (
    <input
      className={className}
      // `inputMode` rather than `type="number"`: a number input gives a spinner nobody wants, a
      // scroll wheel that changes values by accident, and a `value` that reads back as '' for
      // anything it considers invalid — which is exactly the draft text this component exists
      // to keep hold of.
      inputMode={signed ? 'text' : 'numeric'}
      aria-label={label}
      value={draft ?? format(value, signed)}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const parsed = parse(text, signed);
        if (parsed !== null && (signed || parsed >= min)) onChange(parsed);
      }}
      onBlur={() => setDraft(null)}
    />
  );

  if (!stepper) return input;

  return (
    <span className="stepper">
      <button
        type="button"
        className="step"
        aria-label={`Decrease ${label}`}
        // At zero there is nowhere down to go for an unsigned field, and calling the setter
        // anyway would throw `NEGATIVE`. Disabling says so before the tap rather than after.
        disabled={!signed && value <= min}
        onClick={() => step(-1)}
      >
        {'−'}
      </button>
      {input}
      <button
        type="button"
        className="step"
        aria-label={`Increase ${label}`}
        onClick={() => step(1)}
      >
        +
      </button>
    </span>
  );
}

function format(value: number, signed: boolean): string {
  return signed && value >= 0 ? `+${value}` : String(value);
}

/** `null` for anything that is not a whole number the caller accepts. */
function parse(text: string, signed: boolean): number | null {
  const pattern = signed ? /^[+-]?\d+$/ : /^\d+$/;
  if (!pattern.test(text.trim())) return null;
  return Number(text.trim());
}
