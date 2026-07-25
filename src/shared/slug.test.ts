import { describe, expect, it } from 'vitest';
import { slug } from './slug.js';

describe('slug', () => {
  it('lowercases and hyphenates words', () => {
    expect(slug('Sable Nightwind')).toBe('sable-nightwind');
  });

  it('strips characters that are unsafe in filenames', () => {
    expect(slug('Thorne "The Wall" Ironfell/Jr')).toBe('thorne-the-wall-ironfell-jr');
  });

  it('collapses runs of separators and trims them from both ends', () => {
    expect(slug('  --Wren   Duskwhisper--  ')).toBe('wren-duskwhisper');
  });

  it('preserves digits', () => {
    expect(slug('Character 2')).toBe('character-2');
  });

  it('falls back to "character" when nothing usable survives', () => {
    expect(slug('***')).toBe('character');
  });
});
