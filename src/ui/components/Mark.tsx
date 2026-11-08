/** The wireframe's `.mk` square, as a toggle button so it reads as one to a screen reader. */
export function Mark({
  label,
  letter,
  on,
  onChange,
}: {
  label: string;
  letter: string;
  on: boolean;
  onChange(value: boolean): void;
}) {
  return (
    <button
      type="button"
      className={on ? 'mk on' : 'mk'}
      aria-label={label}
      aria-pressed={on}
      onClick={() => onChange(!on)}
    >
      {letter}
    </button>
  );
}
