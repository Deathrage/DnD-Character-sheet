import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** Forbids `layer` from importing any of `forbidden`. Spec §2. */
const boundary = (layer, forbidden) => ({
  files: [`src/${layer}/**/*.ts`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: forbidden.map((target) => ({
          group: [`@/${target}`, `@/${target}/*`, `**/${target}/**`],
          message: `src/${layer} must not import src/${target} (spec §2).`,
        })),
      },
    ],
  },
});

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', '.superpowers', 'docs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  boundary('shared', ['data', 'business', 'ui']),
  boundary('data', ['business', 'ui']),
  boundary('business', ['ui']),
);
