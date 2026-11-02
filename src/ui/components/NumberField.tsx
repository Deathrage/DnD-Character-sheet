import { useState } from 'react';
import { addDecimals, MAX_DECIMALS } from '../../shared/decimal.js';
import { useSelectOnFocus } from './selectOnFocus.js';

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
  /**
   * Accepts a fraction of up to three places, typed with a point or a comma — a phone keyboard
   * in `decimal` mode offers whichever its locale uses, and a Czech or German phone offers the
   * comma. Opt-in: a counter counts in parts since schema v7, nothing else on the sheet does.
   */
  decimal?: boolean;
  /** What − and + add or subtract. A counter's step; one for everything else. */
  step?: number;
  className?: string;
  /**
   * Selects the whole value when a click or tap focuses the field, so typing replaces it. On by
   * default, unlike `NameField`'s: a number is retyped, almost never edited a digit at a time.
   */
  selectOnFocus?: boolean;
}

/**
 * A numeric input that keeps half-typed text to itself.
 *
 * This is the UI half of a contract the business layer states in `guards.ts`: its setters throw
 * `NOT_AN_INTEGER` / `UNSAFE_INTEGER` / `NEGATIVE` on bad input because they are a net for a UI
 * bug, not input validation. So `onChange` fires only for text that is a whole number the
 * document can store — an empty box, a lone `-`, `1e3`, or twenty digits are all text that may
 * not reach a setter, and stay a draft until blur shows the stored value again.
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
  decimal = false,
  step = 1,
  selectOnFocus = true,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const selectOnPress = useSelectOnFocus(selectOnFocus);

  /**
   * Steps from `value`, never from the draft text. A tap is a committed number, so it starts
   * from the number that is actually stored: if the box currently holds a half-typed `4` on the
   * way to `45`, `value` is already 4 — and if it holds something unparseable, `value` is still
   * the last good one. Dropping the draft afterwards is what makes the new number appear.
   */
  const nudge = (delta: number) => {
    setDraft(null);
    // Rounded to the operands' places: 0.2 + 0.1 must be 0.3, not 0.30000000000000004, which the
    // setter would store and the schema then refuse. A whole number plus 1 is unchanged by it.
    const next = addDecimals(value, delta * step);
    onChange(signed ? next : Math.max(min, next));
  };

  const input = (
    <input
      className={className}
      // `inputMode` rather than `type="number"`: a number input gives a spinner nobody wants, a
      // scroll wheel that changes values by accident, and a `value` that reads back as '' for
      // anything it considers invalid — which is exactly the draft text this component exists
      // to keep hold of.
      inputMode={signed ? 'text' : decimal ? 'decimal' : 'numeric'}
      // Chrome on Android otherwise puts its autofill bar — saved passwords, cards, addresses —
      // above the keyboard on every field, and nothing on a character sheet is one of those.
      autoComplete="off"
      aria-label={label}
      value={draft ?? format(value, signed)}
      onChange={(event) => {
        const text = event.target.value;
        setDraft(text);
        const parsed = parse(text, signed, decimal);
        if (parsed !== null && (signed || parsed >= min)) onChange(parsed);
      }}
      {...selectOnPress}
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
        disabled={signed ? addDecimals(value, -step) < -Number.MAX_SAFE_INTEGER : value <= min}
        onClick={() => nudge(-1)}
      >
        {'−'}
      </button>
      {input}
      <button
        type="button"
        className="step"
        aria-label={`Increase ${label}`}
        // Past this the setter would throw `UNSAFE_INTEGER`, for the reason the − button gives;
        // by the step, not by one, or a step of 5 would carry a value 2 short of the edge over it.
        disabled={addDecimals(value, step) > Number.MAX_SAFE_INTEGER}
        onClick={() => nudge(1)}
      >
        +
      </button>
    </span>
  );
}

function format(value: number, signed: boolean): string {
  return signed && value >= 0 ? `+${value}` : String(value);
}

const FRACTION = `(?:[.,]\\d{1,${MAX_DECIMALS}})?`;
// Built once: `parse` runs on every keystroke of every numeric field on the sheet.
const PATTERNS = {
  whole: /^\d+$/,
  signed: /^[+-]?\d+$/,
  decimal: new RegExp(`^\\d+${FRACTION}$`),
  signedDecimal: new RegExp(`^[+-]?\\d+${FRACTION}$`),
};

/**
 * `null` for anything that is not a number the caller accepts: an optional sign when `signed`,
 * digits, and when `decimal` an optional point or comma with up to three places. One shape for
 * every field, so a whole number is a decimal with no places and the two cannot drift apart.
 * `4.` or `.5` is a draft, not a number.
 *
 * The number must also be the one typed. Twenty digits match the pattern, but `Number` rounds
 * them to an integer the schema cannot store; and near that edge a fraction is dropped without
 * a word (`9007199254740990.5` reads back as `…990`). So a value past `Number.MAX_SAFE_INTEGER`
 * is `null`, and so is one whose shortest text is not the text typed, once a comma, a plus, a
 * leading zero and a fraction's trailing zeros — all of which `Number` legitimately forgets —
 * are set aside. That last rule also refuses `-0`, which prints as `0` and is nothing the
 * document wants.
 */
function parse(text: string, signed: boolean, decimal: boolean): number | null {
  const trimmed = text.trim();
  const pattern = signed
    ? decimal
      ? PATTERNS.signedDecimal
      : PATTERNS.signed
    : decimal
      ? PATTERNS.decimal
      : PATTERNS.whole;
  if (!pattern.test(trimmed)) return null;
  const canonical = trimmed
    .replace(',', '.')
    .replace(/^\+/, '')
    .replace(/^(-?)0+(?=\d)/, '$1')
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  const value = Number(canonical);
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER || String(value) !== canonical) return null;
  return value;
}
