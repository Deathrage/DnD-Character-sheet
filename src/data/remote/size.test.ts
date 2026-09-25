import { describe, expect, it } from 'vitest';
import { MAX_DOCUMENT_BYTES, documentSize, stringSize, valueSize } from './size.js';

describe('size', () => {
  it("is Firestore's document limit", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(1_048_576);
  });

  it.each([
    ['null', null, 1] as const,
    ['a boolean', true, 1] as const,
    ['an integer', 2, 8] as const,
    ['a double', 2.5, 8] as const,
    ['an ASCII string', 'ab', 3] as const,
    ['a multi-byte string, by UTF-8 bytes', 'é', 3] as const,
    ['bytes', new Uint8Array(5), 5] as const,
    ['an array', [1, 'ab'], 11] as const,
    ['an empty array, as the emulator counts it', [], 1] as const,
    ['a map', { k: null }, 3] as const,
    ['an empty map, as the emulator counts it', {}, 1] as const,
    ['a nested map', { m: { k: new Uint8Array(4) } }, 2 + 2 + 4] as const,
  ])('sizes %s', (name: string, value: unknown, size: number) => {
    expect(valueSize(value)).toBe(size);
  });

  it('sizes a string key the way it sizes a string value', () => {
    expect(stringSize('cloud')).toBe(6);
  });

  it('sizes a document: its name, its fields, and 32', () => {
    // name: ('cloud' 6) + ('u1' 3) + 16 = 25. Field 'a': 2 + 8.
    expect(documentSize(['cloud', 'u1'], { a: 1 })).toBe(25 + 10 + 32);
  });

  it('refuses a value Firestore has no size for, rather than guessing', () => {
    expect(() => valueSize(undefined)).toThrow(TypeError);
  });
});
