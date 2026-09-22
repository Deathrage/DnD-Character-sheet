import type { StorybookConfig } from '@storybook/react-vite';

/**
 * Storybook 10: viewports, backgrounds and actions ship inside the `storybook` package itself,
 * so there is no addon list here. Verified against the installed 10.6.0 rather than recalled —
 * older majors needed `@storybook/addon-essentials`, which no longer exists.
 */
const config: StorybookConfig = {
  stories: ['../src/ui/**/*.stories.tsx'],
  framework: '@storybook/react-vite',
};

export default config;
