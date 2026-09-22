import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Forbids `layer` from importing any of `forbidden`. Spec §2.
 *
 * `ignores` carves a sub-directory out of `layer` so it can be given different rules (used to
 * split `data` from `data/schema`, which needs a different `no-restricted-imports` value — see
 * below). `extra` appends additional restricted-import patterns beyond the standard layer set.
 *
 * Every config object below that sets `no-restricted-imports` for an overlapping set of files
 * must combine all of that fileset's patterns into one call: ESLint flat config does not merge
 * a rule's array-valued options across matching config objects, it replaces them wholesale, so
 * a second, later `no-restricted-imports` entry for the same file would silently discard the
 * first one's patterns rather than add to them. (Verified directly against eslint@9 before
 * relying on it — see the Task 3 fix report.)
 */
const boundary = (layer, forbidden, { ignores, extra = [] } = {}) => ({
  // `.tsx` as well as `.ts`: `src/ui` is all components, so a `.ts`-only pattern would have
  // left the one boundary that guards against reaching past `business` into `data` matching
  // almost nothing in the layer it exists to police.
  files: [`src/${layer}/**/*.{ts,tsx}`],
  ...(ignores ? { ignores } : {}),
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          ...forbidden.map((target) => ({
            group: [`@/${target}`, `@/${target}/*`, `**/${target}/**`],
            message: `src/${layer} must not import src/${target} (spec §2).`,
          })),
          ...extra,
        ],
      },
    ],
  },
});

/**
 * Forbids importing a schema version directory (`schema/v1/`, and any future `schema/v2/`, ...)
 * from anywhere except inside `src/data/schema/` itself. Version directories are isolated by
 * construction (see src/data/schema/README.md) so the migration loop can trust a version's
 * schema still means what it meant when that version shipped; without this rule that isolation
 * rested on convention and the README alone. Consumers ask `src/data/schema`'s public barrel
 * for "the current schema" or "the schema for version N" and never reach into a version
 * directory directly.
 */
const SCHEMA_VERSION_PATTERN = {
  group: ['**/schema/v*/**'],
  message:
    'Import src/data/schema (its public barrel), not a version directory directly — version directories are internal (see src/data/schema/README.md).',
};

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'storybook-static', 'node_modules', '.superpowers', 'docs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Spec §10. The rules-of-hooks check is the one that earns its place: a hook behind a
  // condition fails at runtime, in a component, on a device, and not in `tsc`.
  // `configs.flat['recommended-latest']`, not `configs['recommended-latest']`: in
  // eslint-plugin-react-hooks 7 the top-level entries are still eslintrc-shaped (`plugins` as
  // an array of strings) and ESLint 10 rejects them outright. Checked against the installed
  // plugin, not recalled.
  reactHooks.configs.flat['recommended-latest'],
  boundary('shared', ['data', 'business', 'ui']),
  boundary('data', ['business', 'ui'], {
    ignores: ['src/data/schema/**/*.ts'],
    extra: [SCHEMA_VERSION_PATTERN],
  }),
  // src/data/schema/ is the one place allowed to reach into a version directory, so it is
  // split out of the `data` boundary above instead of inheriting the schema-version pattern.
  boundary('data/schema', ['business', 'ui']),
  boundary('business', ['ui'], { extra: [SCHEMA_VERSION_PATTERN] }),
  // `ui` may import `business` and `shared` only (spec §2) — reaching past the business layer
  // into `data` is a violation, so `data` must be listed here. An empty forbidden list would
  // leave this boundary restricting nothing at all.
  boundary('ui', ['data'], { extra: [SCHEMA_VERSION_PATTERN] }),
);
