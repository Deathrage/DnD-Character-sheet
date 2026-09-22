/**
 * Mints an id for an item stored in a character document. Every id in a document comes from
 * here; the data layer never generates one, because a blank document contains only empty
 * collections.
 *
 * Deliberately not injectable, unlike `createCharacter`'s `id` and `now`. Injection would buy
 * deterministic ids in tests, and the business tests barely want them — rule tests use whatever
 * id `add()` returned. That is cheaper than threading a constructor parameter through sixteen
 * classes, and it leaves one place for the fallback below.
 */
export function createId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return fallbackV4();
  }
}

/**
 * `crypto.randomUUID` is available only in a secure context. `crypto.getRandomValues` is not
 * restricted that way, so it works on the plain-HTTP LAN origin a phone uses to test the app.
 * The version and variant bits are set here rather than trusted from the random bytes, because
 * the schema validates with `z.uuidv4()`, which checks both.
 */
function fallbackV4(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
