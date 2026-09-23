import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook 10: viewports, backgrounds and actions ship inside the `storybook` package itself,
 * so there is no addon list here. Verified against the installed 10.6.0 rather than recalled —
 * older majors needed `@storybook/addon-essentials`, which no longer exists.
 */
const config: StorybookConfig = {
  stories: ['../src/ui/**/*.stories.tsx'],
  framework: '@storybook/react-vite',
  /**
   * Storybook reuses `vite.config.ts`, and with it `vite-plugin-pwa` — which then tries to
   * precache Storybook's own multi-megabyte bundles and fails the build. A service worker has no
   * business in Storybook, so its plugins are dropped here.
   */
  viteFinal: (config) => ({
    ...config,
    plugins: (config.plugins ?? [])
      .flat()
      .filter(
        (plugin) => !(plugin && 'name' in plugin && plugin.name.startsWith('vite-plugin-pwa')),
      ),
  }),
};

export default config;
