interface Props {
  /** A data URL, or `null` for the initial-letter placeholder. */
  src: string | null;
  name: string;
}

/** Decorative: the character's name is always beside it, so it has no alt text of its own. */
export function Portrait({ src, name }: Props) {
  return src === null ? (
    <span className="portrait empty" aria-hidden="true">
      {name.charAt(0).toUpperCase()}
    </span>
  ) : (
    <img className="portrait" src={src} alt="" />
  );
}
