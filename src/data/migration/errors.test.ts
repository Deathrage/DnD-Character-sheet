import { describe, expect, it } from 'vitest';
import { describeLoadError } from './errors.js';

describe('describeLoadError', () => {
  it('explains an unversioned file', () => {
    expect(describeLoadError({ code: 'UNVERSIONED' })).toMatch(/schemaVersion/);
  });

  it('names both versions for a file from the future, in the right roles', () => {
    const message = describeLoadError({ code: 'FROM_FUTURE', found: 4, current: 1 });
    // Containment alone cannot detect the two being swapped in the copy — "schema 1, this build
    // understands 4" contains both numbers just as happily, and tells the user to DOWNGRADE
    // their app to open a file that is in fact newer. Assert each number in its own role, and
    // assert the found version is named before the current one.
    expect(message).toContain('schema 4');
    expect(message).toContain('this build understands 1');
    expect(message.indexOf('4')).toBeLessThan(message.indexOf('1'));
  });

  it('lists the offending field paths for a schema failure', () => {
    const message = describeLoadError({
      code: 'INVALID_AT_VERSION',
      version: 1,
      issues: [{ path: 'armorClass', message: 'must be >= 0' }],
    });
    expect(message).toContain('armorClass: must be >= 0');
  });

  it('joins multiple issues with "; " so every offending field is named', () => {
    // The multi-issue join had no coverage: a single-issue list never exercises the separator,
    // so a change to it (or to `.join('')`) would not have failed anything. A rejected document
    // usually has several issues at once, which is the case a repair screen actually shows.
    const message = describeLoadError({
      code: 'INVALID_AT_VERSION',
      version: 1,
      issues: [
        { path: 'armorClass', message: 'must be >= 0' },
        { path: 'abilitiesAndSkills.abilities.strength.score', message: 'expected number' },
      ],
    });
    expect(message).toContain(
      'armorClass: must be >= 0; abilitiesAndSkills.abilities.strength.score: expected number',
    );
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
