import { formatHitPoints, plural } from './format.js';

describe('formatHitPoints', () => {
  it('is current over total', () => {
    expect(formatHitPoints({ current: 9, total: 16, temporary: 0 })).toBe('9/16');
  });

  it('adds temporary hit points when there are any', () => {
    expect(formatHitPoints({ current: 9, total: 16, temporary: 5 })).toBe('9/16 +5');
  });
});

describe('plural', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'item')).toBe('1 item');
    expect(plural(1, 'entry', 'entries')).toBe('1 entry');
  });

  it('adds an s, or takes the given plural, for zero and for many', () => {
    expect(plural(0, 'item')).toBe('0 items');
    expect(plural(3, 'item')).toBe('3 items');
    expect(plural(134, 'entry', 'entries')).toBe('134 entries');
  });
});
