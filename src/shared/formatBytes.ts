/**
 * Decimal units, as a phone's storage settings show them. In `shared/` because the business
 * layer builds a sentence with it ("this version needs 19.6 KB") and the cloud screen shows it.
 */
export function formatBytes(bytes: number): string {
  return bytes < 1_000_000
    ? `${(bytes / 1000).toFixed(1)} KB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;
}
