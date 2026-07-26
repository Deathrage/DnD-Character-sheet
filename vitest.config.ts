import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src/', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Fixed, DST-free, non-UTC so date-boundary tests (e.g. exportFilename) are deterministic
    // regardless of the host machine's or CI runner's own timezone.
    env: { TZ: 'Etc/GMT+5' },
  },
});
