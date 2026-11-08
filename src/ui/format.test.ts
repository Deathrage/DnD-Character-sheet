import { formatHitPoints } from './format.js';

describe('formatHitPoints', () => {
  it('is current over total', () => {
    expect(formatHitPoints({ current: 9, total: 16, temporary: 0 })).toBe('9/16');
  });

  it('adds temporary hit points when there are any', () => {
    expect(formatHitPoints({ current: 9, total: 16, temporary: 5 })).toBe('9/16 +5');
  });
});
