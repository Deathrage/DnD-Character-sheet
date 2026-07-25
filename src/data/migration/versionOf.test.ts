import { describe, expect, it } from 'vitest';
import { CharacterLoadError } from './errors.js';
import { versionOf } from './versionOf.js';

const CURRENT = 1;

const expectLoadError = (raw: unknown, code: string) => {
  try {
    versionOf(raw, CURRENT);
    throw new Error('expected versionOf to throw');
  } catch (caught) {
    expect(caught).toBeInstanceOf(CharacterLoadError);
    expect((caught as CharacterLoadError).detail.code).toBe(code);
  }
};

describe('versionOf', () => {
  it('reads a valid version', () => {
    expect(versionOf({ schemaVersion: 1 }, CURRENT)).toBe(1);
  });

  it('accepts an older version, which is what makes migration possible', () => {
    expect(versionOf({ schemaVersion: 1 }, 3)).toBe(1);
  });

  it.each([
    ['a missing field', {}],
    ['a string', { schemaVersion: '1' }],
    ['zero', { schemaVersion: 0 }],
    ['a negative number', { schemaVersion: -1 }],
    ['a fraction', { schemaVersion: 1.5 }],
    ['null', null],
    ['an array', []],
    ['a primitive', 42],
  ])('reports UNVERSIONED for %s', (_label, raw) => {
    expectLoadError(raw, 'UNVERSIONED');
  });

  it('reports FROM_FUTURE for a version this build does not know', () => {
    expectLoadError({ schemaVersion: 99 }, 'FROM_FUTURE');
  });

  it('carries both versions on FROM_FUTURE so the message can be specific', () => {
    try {
      versionOf({ schemaVersion: 99 }, CURRENT);
    } catch (caught) {
      expect((caught as CharacterLoadError).detail).toEqual({
        code: 'FROM_FUTURE',
        found: 99,
        current: 1,
      });
    }
  });
});
