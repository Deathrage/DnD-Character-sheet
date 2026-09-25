import { CharacterLoadError } from './errors.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads the version field (`schemaVersion` for a character, `layoutVersion` for the cloud
 * layout) from an untrusted value.
 * Throws CharacterLoadError with UNVERSIONED or FROM_FUTURE.
 *
 * `current` is a parameter rather than an import so the migration machinery can
 * be tested against a synthetic version ceiling — see parseCharacter.
 */
export function versionOf(raw: unknown, current: number, key = 'schemaVersion'): number {
  if (!isRecord(raw)) {
    throw new CharacterLoadError({ code: 'UNVERSIONED' });
  }

  const found = raw[key];
  if (typeof found !== 'number' || !Number.isInteger(found) || found < 1) {
    throw new CharacterLoadError({ code: 'UNVERSIONED' });
  }

  if (found > current) {
    throw new CharacterLoadError({ code: 'FROM_FUTURE', found, current });
  }

  return found;
}
