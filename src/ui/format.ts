/** The letter on an account's avatar. */
export function initialOf(name: string | null | undefined): string {
  return name?.trim().charAt(0).toUpperCase() || '?';
}

/** "24 Sep, 18:03", in the player's own locale and timezone. */
export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** `+6`, `+0`, `-1`: a bonus as a D&D sheet prints it. */
export function formatSigned(value: number): string {
  return value >= 0 ? `+${value}` : String(value);
}
