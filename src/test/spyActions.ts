import { vi } from 'vitest';

/**
 * Every action a spy, so a test can assert exactly what a screen asked for. Built from the
 * screen's `no*Actions` fixture, so it has every key the actions type has. Shared rather than
 * repeated, for the reason `stubDialog.ts` gives: a second copy is how the two drift.
 */
export function spyActions<T extends object>(
  none: T,
): { [K in keyof T]: ReturnType<typeof vi.fn> } & T {
  return Object.fromEntries(
    Object.keys(none).map((key) => [key, vi.fn(() => null)]),
  ) as unknown as { [K in keyof T]: ReturnType<typeof vi.fn> } & T;
}
