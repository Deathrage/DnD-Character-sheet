import type { ReactNode } from 'react';

interface Props {
  name: string;
  description: string;
  onOpen(): void;
  /** Rendered before the name — the prepared dot on a spell. */
  before?: ReactNode;
  /** Rendered after the name — a level badge, a count, a current/total cluster. */
  after?: ReactNode;
  /** Dims the row: an unprepared spell, a spent counter. */
  dim?: boolean;
}

/**
 * The wireframe's `.rec`: a name, a one-line description preview, and a chevron.
 *
 * `before` and `after` are slots rather than props like `level` or `count`, because what sits
 * beside the name is the only thing that differs across the five sections that use this row —
 * and some of those slots hold an input, which must not open the dialog when tapped.
 */
export function ItemRow({ name, description, onOpen, before, after, dim }: Props) {
  const preview = description.replace(/\s+/g, ' ').trim();

  return (
    <div className={dim === true ? 'rec dim' : 'rec'}>
      {before}
      {/* The button covers the name and preview only. An input in `after` is a sibling, not a
          descendant — nesting a control inside a button is invalid and swallows its taps. */}
      <button type="button" className="recopen" onClick={onOpen}>
        <span className="nm">{name}</span>
        {preview !== '' && <span className="pv">{preview}</span>}
      </button>
      {after}
      <span className="chev" aria-hidden="true">
        {'›'}
      </span>
    </div>
  );
}
