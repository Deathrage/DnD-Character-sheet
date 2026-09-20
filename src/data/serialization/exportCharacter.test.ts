import { describe, expect, it } from 'vitest';
import { ID_A, FIXED_NOW, docFor } from '../../test/fixtures.js';
import { exportFilename, toJsonText } from './exportCharacter.js';

const doc = docFor(ID_A, 'Sable Nightwind');

describe('toJsonText', () => {
  it('pretty-prints with two-space indentation, so the file is diffable', () => {
    const text = toJsonText(doc);
    expect(text.split('\n').length).toBeGreaterThan(20);
    expect(text).toContain(`\n  "id": "${ID_A}"`);
  });

  it('ends with a newline, as text files should', () => {
    expect(toJsonText(doc).endsWith('\n')).toBe(true);
  });

  it('round-trips through JSON.parse unchanged', () => {
    expect(JSON.parse(toJsonText(doc))).toEqual(doc);
  });
});

describe('exportFilename', () => {
  it('combines a slug and the date', () => {
    expect(exportFilename('Sable Nightwind', FIXED_NOW)).toBe('sable-nightwind-2026-07-25.json');
  });

  it('uses the UTC date late in the UTC day, so an east-of-UTC host does not roll the date forward', () => {
    expect(exportFilename('Wren', new Date('2026-07-25T23:30:00.000Z'))).toBe(
      'wren-2026-07-25.json',
    );
  });

  it('uses the UTC date early in the UTC day, so a west-of-UTC host does not roll the date back', () => {
    expect(exportFilename('Fenn', new Date('2026-07-25T00:30:00.000Z'))).toBe(
      'fenn-2026-07-25.json',
    );
  });

  it('stays usable when the name has no alphanumerics', () => {
    expect(exportFilename('***', new Date('2026-07-25T09:41:00.000Z'))).toBe(
      'character-2026-07-25.json',
    );
  });
});
