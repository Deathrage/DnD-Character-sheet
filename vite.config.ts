import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

/**
 * One config for the app and the tests. It replaced a separate `vitest.config.ts`: Vitest reads
 * `vitest.config.ts` *instead of* this file rather than merging the two, so two files meant two
 * copies of the `@` alias, free to drift apart without anything failing.
 */
export default defineConfig({
  // `base: ''` so the build works from any directory, including opened from disk — this is a
  // local-first app that should not need a server rooted at /.
  base: '',
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src/', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    // Fixed, DST-free, non-UTC so date-boundary tests (e.g. exportFilename) are deterministic
    // regardless of the host machine's or CI runner's own timezone. POSIX inverts the sign:
    // `Etc/GMT+5` is UTC−5.
    env: { TZ: 'Etc/GMT+5' },
    setupFiles: ['src/test/setupIndexedDb.ts'],
  },
});
