import type { CSSProperties } from 'react';
import { ABILITIES } from '../reference.js';
import type { AbilityKey } from '../types.js';

interface Props {
  /** Names the group for assistive technology; the visible label is the dialog's own `dlabel`. */
  label: string;
  value: AbilityKey | null;
  onChange(value: AbilityKey | null): void;
  /** Adds a leading "None": a weapon may have no attack; a spellcasting entry always has one. */
  allowNone?: boolean;
  /** Abilities that cannot be picked: spellcasting disables those that already have an entry. */
  disabled?: readonly AbilityKey[];
}

/**
 * One row of ability buttons, in the proficiency toggles' look (spec §5.3). Buttons rather than a
 * select: every choice is visible at once, the chosen one reads as the stat block does, and a
 * choice that is not allowed shows as disabled instead of vanishing from a list.
 */
export function AbilityPicker({ label, value, onChange, allowNone = false, disabled = [] }: Props) {
  const options: { key: AbilityKey | null; short: string }[] = [
    ...(allowNone ? [{ key: null, short: 'None' }] : []),
    ...ABILITIES,
  ];
  return (
    <div
      className="abpick"
      role="radiogroup"
      aria-label={label}
      style={{ '--n': options.length } as CSSProperties}
    >
      {options.map((option) => (
        <button
          key={option.key ?? 'none'}
          type="button"
          role="radio"
          aria-checked={value === option.key}
          disabled={option.key !== null && disabled.includes(option.key)}
          onClick={() => onChange(option.key)}
        >
          {option.short}
        </button>
      ))}
    </div>
  );
}
