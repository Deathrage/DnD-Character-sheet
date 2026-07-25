import { describe, expect, it } from 'vitest';
import { describeLoadError } from './errors.js';

describe('describeLoadError', () => {
  it('explains an unversioned file', () => {
    expect(describeLoadError({ code: 'UNVERSIONED' })).toMatch(/schemaVersion/);
  });

  it('names both versions for a file from the future', () => {
    const message = describeLoadError({ code: 'FROM_FUTURE', found: 4, current: 1 });
    expect(message).toContain('4');
    expect(message).toContain('1');
  });

  it('lists the offending field paths for a schema failure', () => {
    const message = describeLoadError({
      code: 'INVALID_AT_VERSION',
      version: 1,
      issues: [{ path: 'armorClass', message: 'must be >= 0' }],
    });
    expect(message).toContain('armorClass: must be >= 0');
  });

  it('omits an empty path rather than printing a stray colon', () => {
    const message = describeLoadError({
      code: 'INVALID_AT_VERSION',
      version: 1,
      issues: [{ path: '', message: 'expected an object' }],
    });
    expect(message).toContain('expected an object');
    expect(message).not.toContain(': expected an object');
  });

  it('reports which version a failed migration started from', () => {
    expect(describeLoadError({ code: 'MIGRATION_FAILED', version: 2, cause: null })).toContain('2');
  });
});
