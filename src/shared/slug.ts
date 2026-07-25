const FALLBACK = 'character';

/** Filename-safe, lowercase, hyphen-separated form of a character name. */
export function slug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned.length > 0 ? cleaned : FALLBACK;
}
