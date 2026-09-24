import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
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
  plugins: [
    react(),
    // The service worker that lets the installed app start offline. `manifest: false` keeps the
    // hand-written `public/manifest.webmanifest`, which `index.html` links itself. `prompt`, not
    // `autoUpdate`, for the reason in `src/ui/UpdatePrompt.tsx`.
    VitePWA({
      registerType: 'prompt',
      manifest: false,
      // `/__/` is Firebase Hosting's reserved path; the sign-in redirect lands on
      // `/__/auth/handler`, which must reach the network, not the cached app shell.
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        navigateFallbackDenylist: [/^\/__\//],
      },
    }),
  ],
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
