import { describe, expect, it } from 'vitest';
import { formatBytes } from './formatBytes.js';

describe('formatBytes', () => {
  it('uses KB below a million bytes and MB from there', () => {
    expect(formatBytes(12_345)).toBe('12.3 KB');
    expect(formatBytes(999_999)).toBe('1000.0 KB');
    expect(formatBytes(1_048_576)).toBe('1.0 MB');
  });
});
