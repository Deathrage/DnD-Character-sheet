interface Props {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}

/**
 * The wireframe's `.chkrow` — a square box and a label, used for Attuned, Equipped and Prepared.
 *
 * It is a real `<input type="checkbox">` with the box drawn over it rather than a styled `<span>`
 * with a click handler, so it is reachable by keyboard and announced as a checkbox. The wireframe
 * used the span; that was a sketch, and this is the part of it not worth copying.
 */
export function CheckRow({ label, checked, onChange }: Props) {
  return (
    <label className="chkrow">
      <input
        type="checkbox"
        className="chkinput"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="box" aria-hidden="true">
        {'✓'}
      </span>
      <span className="lab">{label}</span>
    </label>
  );
}
