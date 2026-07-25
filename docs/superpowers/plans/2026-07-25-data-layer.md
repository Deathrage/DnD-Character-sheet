# Character Sheet — Foundation & Data Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the tooling foundation and a fully tested data-access layer that can create, validate, version, migrate, serialize and store a character document.

**Architecture:** Plan 1 of 3 for the first vertical slice. This plan produces `src/shared/` and `src/data/` only — no MobX, no React. Every piece is exercised through unit tests, so the layer is complete and provably correct before anything consumes it. Plan 2 adds the business layer, plan 3 the UI.

**Tech Stack:** TypeScript (strict), Vitest, Zod for validation, `idb` for IndexedDB, `fake-indexeddb` for tests, ESLint flat config, Prettier.

**Spec:** `docs/superpowers/specs/2026-07-25-dnd-character-sheet-design.md`. Section references below (§2, §3.2 …) point at it.

## Global Constraints

Every task's requirements implicitly include this section.

- **TypeScript strict**, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`. Record lookups therefore yield `T | undefined` and must be narrowed, never asserted with `!`.
- **Layer imports (§2):** `data` may import only `shared`. `shared` imports nothing internal. Enforced by ESLint; a violation fails `npm run lint`.
- **Prettier:** single quotes, semicolons, trailing commas `all`, `printWidth` 100, `endOfLine` `lf`.
- **No derived value is ever stored.** `level`, attuned and equipped lists are computed in the business layer (plan 2). Nothing in `src/data/` may write them into a document.
- **String limits:** `ShortName` 1–80 chars, `CategoryName` 1–40, `LongText` 0–20 000. Names are trimmed and must be non-empty after trimming.
- **`current` is never validated against `total`** (§3.2). A player may deliberately exceed it.
- **No order arrays (§3.4).** Display order is object-key insertion order. Renaming a key must preserve position, never delete-then-append.
- **Avoid Zod version-specific format helpers.** `z.string().uuid()` (Zod 3) became `z.uuid()` (Zod 4). Use explicit regexes so the code is valid on either major.
- **Tests are colocated:** `foo.ts` is tested by `foo.test.ts` in the same directory.
- **Commit at the end of every task.** Conventional Commit prefixes (`chore:`, `feat:`, `test:`).

---

## File Structure

```
.editorconfig                       formatting for non-VSCode editors
.gitattributes                      force LF so Git stops rewriting line endings
.prettierrc.json                    Prettier options
.vscode/settings.json               format-on-save, Prettier pinned as formatter
.vscode/extensions.json             recommend Prettier + ESLint
eslint.config.js                    flat config incl. layer-boundary rules
package.json                        scripts and dependencies
tsconfig.json                       strict compiler options
vitest.config.ts                    test runner config

src/shared/
  slug.ts                           slug(name) for export filenames
  slug.test.ts

src/data/schema/
  README.md                         the version-isolation rule and how to add v2
  index.ts                          the ONLY entry point used outside schema/: CURRENT,
                                    SCHEMAS registry, CharacterDocument (latest alias)
  v1/                               FROZEN once shipped — see README.md
    primitives.ts                   v1's own names, ints, currentAndTotal, categorized
    primitives.test.ts
    document.ts                     characterDocumentV1Schema + type + cross-field invariants
    document.test.ts
    blank.ts                        createCharacter — a blank document valid at v1
    blank.test.ts
    index.ts                        v1's public face inside schema/

src/data/migration/
  errors.ts                         LoadError union, CharacterLoadError, describeLoadError
  errors.test.ts
  versionOf.ts                      reads and validates schemaVersion
  versionOf.test.ts
  migrations.ts                     MIGRATIONS registry (empty at v1)
  parseCharacter.ts                 upgrade() + parseCharacter(), registry injectable for tests
  parseCharacter.test.ts

src/data/serialization/
  exportCharacter.ts                toJsonText, exportFilename
  exportCharacter.test.ts
  importCharacter.ts                fromJsonText -> ParseTextResult, assigns a new id
  importCharacter.test.ts

src/data/repository/
  types.ts                          CharacterSummary, ListEntry, CharacterRepository
  summarize.ts                      document -> CharacterSummary
  summarize.test.ts
  indexedDbRepository.ts            idb implementation
  indexedDbRepository.test.ts
```

Files are split by responsibility, not by size: schema validation, migration, serialization and storage each change for different reasons and are each independently testable.

### Schema versions are isolated by construction

Each schema version owns a complete, self-contained directory. **Nothing is shared between versions** — v1 has its own primitives, and v2 will start as a copy of `v1/` and diverge. Once a version ships, its directory is never edited again.

This is deliberate duplication, and it protects the thing the whole design rests on. The migration loop validates a document *at its own version* before migrating it, which is only meaningful if v1's schema still means what it meant when v1 shipped. With primitives shared across versions, tightening a rule for v2's benefit would make `validateAt(1, doc)` reject a v1 file that was always legitimately valid — and the app would report `INVALID_AT_VERSION`, blaming the user's file for a change we made. Loosening one is just as bad: a v1 document that should have been rejected reaches a migration written on the assumption it could not exist.

The behavioural lock comes free with the structural one: because each version's tests are colocated and frozen with it, editing v1's limits immediately fails v1's own tests.

Only `src/data/schema/index.ts` is imported from outside `schema/`. Version directories are internal, so the rest of the data layer never names a version.

**The blank-document factory lives inside the version directory too**, for the same reason the schema does: a blank document must satisfy its version's required fields, so a v1 factory cannot produce a valid v2 document. `schema/index.ts` re-exports it as `createCharacter`, a version-tracking export exactly parallel to the `CharacterDocument` alias.

Consequently `schema/index.ts` does **not** export `ABILITY_KEYS`, `SKILL_KEYS` or `SPELL_SLOT_LEVELS`. Those are v1 facts, and the only thing outside `document.ts` that wants them is the blank factory, which is now colocated with them. Exporting them unversioned would mean every consumer silently switched lists the day v2 renamed a skill. The UI does not want them either: it needs display labels such as `"Animal Handling"` and an ability badge, which the schema's camelCase keys do not carry.

---

## Task 1: Tooling foundation

Delivers a repository where `npm test`, `npm run lint` and Prettier all work, plus the first real shared helper so the task ends on a tested deliverable rather than scaffolding alone.

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.editorconfig`, `.gitattributes`, `.vscode/settings.json`, `.vscode/extensions.json`
- Create: `src/shared/slug.ts`
- Test: `src/shared/slug.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `slug(value: string): string`, used by Task 5 for export filenames.

- [ ] **Step 1: Initialise the package and install dependencies**

Run each command from the repository root. Versions are resolved at install time rather than pinned here, so nothing goes stale.

```bash
npm init -y
npm install zod idb
npm install -D typescript vite vitest @eslint/js eslint typescript-eslint prettier fake-indexeddb
```

Only what this plan needs. React, MobX, the router, Storybook and the PWA plugin arrive in plans 2 and 3.

- [ ] **Step 2: Write `package.json` scripts**

Replace the generated `scripts` block, and add `"type": "module"`:

```json
{
  "name": "dnd-character-sheet",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "format": "prettier --write ."
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["vitest/globals"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src", "vitest.config.ts", "eslint.config.js"]
}
```

`noUncheckedIndexedAccess` is deliberate: this codebase is full of `Record`s keyed by user-supplied names, and a lookup genuinely can miss. It will force `undefined` checks — write the check, never `!`.

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
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
  },
});
```

Use `fileURLToPath`, not `new URL(...).pathname`. On Windows the latter yields `/F:/git/...`, which Vite cannot resolve.

- [ ] **Step 5: Write `eslint.config.js` with the layer-boundary rules**

```js
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
```

- [ ] **Step 6: Write the formatting and editor config files**

`.prettierrc.json`:

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100,
  "endOfLine": "lf"
}
```

`.gitattributes` — this stops the `LF will be replaced by CRLF` warnings seen while committing the spec:

```
* text=auto eol=lf
```

`.editorconfig`:

```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

`.vscode/settings.json` — START.md requires Prettier-on-save to work *reliably*, which means pinning the formatter per language rather than relying on the global default:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[typescript]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
  "[typescriptreact]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
  "[json]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
  "[jsonc]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
  "[markdown]": { "editor.defaultFormatter": "esbenp.prettier-vscode" },
  "eslint.useFlatConfig": true
}
```

`.vscode/extensions.json`:

```json
{
  "recommendations": ["esbenp.prettier-vscode", "dbaeumer.vscode-eslint"]
}
```

- [ ] **Step 7: Write the failing test for `slug`**

Create `src/shared/slug.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { slug } from './slug.js';

describe('slug', () => {
  it('lowercases and hyphenates words', () => {
    expect(slug('Sable Nightwind')).toBe('sable-nightwind');
  });

  it('strips characters that are unsafe in filenames', () => {
    expect(slug('Thorne "The Wall" Ironfell/Jr')).toBe('thorne-the-wall-ironfell-jr');
  });

  it('collapses runs of separators and trims them from both ends', () => {
    expect(slug('  --Wren   Duskwhisper--  ')).toBe('wren-duskwhisper');
  });

  it('preserves digits', () => {
    expect(slug('Character 2')).toBe('character-2');
  });

  it('falls back to "character" when nothing usable survives', () => {
    expect(slug('***')).toBe('character');
  });
});
```

The last case matters: a name of only punctuation would otherwise produce a filename of `-2026-07-25.json`.

- [ ] **Step 8: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `./slug.js`.

- [ ] **Step 9: Implement `slug`**

Create `src/shared/slug.ts`:

```ts
const FALLBACK = 'character';

/** Filename-safe, lowercase, hyphen-separated form of a character name. */
export function slug(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return cleaned.length > 0 ? cleaned : FALLBACK;
}
```

- [ ] **Step 10: Run the tests and the other checks**

```bash
npm test
npm run lint
npm run typecheck
```

Expected: tests PASS, lint clean, typecheck clean.

- [ ] **Step 11: Verify the layer-boundary rule actually fires**

A lint rule nobody has seen fail is a lint rule that might not work. Create `src/shared/__boundary-probe.ts`:

```ts
import { parseCharacter } from '@/data/migration/parseCharacter.js';

export const probe = parseCharacter;
```

Run: `npx eslint src/shared/__boundary-probe.ts`
Expected: an error reading `src/shared must not import src/data (spec §2).`

Then delete the probe:

```bash
rm src/shared/__boundary-probe.ts
```

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold TypeScript, Vitest, ESLint layer boundaries and Prettier"
```

---

## Task 2: Schema primitives

The reusable Zod pieces every section is built from. Written and tested first so the document schema in Task 3 is assembly rather than invention.

**Files:**
- Create: `src/data/schema/README.md`, `src/data/schema/v1/primitives.ts`
- Test: `src/data/schema/v1/primitives.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `shortName`, `categoryName`, `longText`, `nonNegativeInt`, `signedInt`, `dieSizeKey`, `uuid`, `isoDateTime`, `currentAndTotal`, `nameAndDescription`, `categorized(item)`, and the constants `MAX_SHORT_NAME`, `MAX_CATEGORY_NAME`, `MAX_LONG_TEXT`.

- [ ] **Step 1: Write the failing test**

Create `src/data/schema/v1/primitives.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  MAX_CATEGORY_NAME,
  MAX_LONG_TEXT,
  MAX_SHORT_NAME,
  categorized,
  categoryName,
  currentAndTotal,
  dieSizeKey,
  isoDateTime,
  longText,
  nameAndDescription,
  nonNegativeInt,
  shortName,
  uuid,
} from './primitives.js';

describe('shortName', () => {
  it('rejects leading or trailing whitespace rather than trimming it', () => {
    expect(shortName.safeParse('  Sable  ').success).toBe(false);
    expect(shortName.safeParse('Sable ').success).toBe(false);
    expect(shortName.safeParse(' Sable').success).toBe(false);
  });

  it('returns an already-trimmed name unchanged', () => {
    expect(shortName.parse('Sable')).toBe('Sable');
  });

  it('preserves internal whitespace', () => {
    expect(shortName.parse('Sable Nightwind')).toBe('Sable Nightwind');
  });

  it('rejects an empty or whitespace-only value', () => {
    expect(shortName.safeParse('').success).toBe(false);
    expect(shortName.safeParse('   ').success).toBe(false);
  });

  it(`accepts exactly ${MAX_SHORT_NAME} characters and rejects one more`, () => {
    expect(shortName.safeParse('a'.repeat(MAX_SHORT_NAME)).success).toBe(true);
    expect(shortName.safeParse('a'.repeat(MAX_SHORT_NAME + 1)).success).toBe(false);
  });
});

describe('categoryName', () => {
  it(`accepts exactly ${MAX_CATEGORY_NAME} characters and rejects one more`, () => {
    expect(categoryName.safeParse('a'.repeat(MAX_CATEGORY_NAME)).success).toBe(true);
    expect(categoryName.safeParse('a'.repeat(MAX_CATEGORY_NAME + 1)).success).toBe(false);
  });

  it('accepts a purely numeric name, which merely sorts first (spec §3.4)', () => {
    expect(categoryName.safeParse('1').success).toBe(true);
  });
});

describe('longText', () => {
  it('accepts an empty string', () => {
    expect(longText.parse('')).toBe('');
  });

  it('does not trim, because leading indentation may be meaningful', () => {
    expect(longText.parse('  indented')).toBe('  indented');
  });

  it(`rejects more than ${MAX_LONG_TEXT} characters`, () => {
    expect(longText.safeParse('a'.repeat(MAX_LONG_TEXT + 1)).success).toBe(false);
  });
});

describe('nonNegativeInt', () => {
  it.each([0, 1, 9999])('accepts %i', (value) => {
    expect(nonNegativeInt.parse(value)).toBe(value);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects %p', (value) => {
    expect(nonNegativeInt.safeParse(value).success).toBe(false);
  });
});

describe('dieSizeKey', () => {
  it.each(['1', '8', '12', '100'])('accepts %s', (value) => {
    expect(dieSizeKey.parse(value)).toBe(value);
  });

  it.each(['0', '08', '', 'd8', '-8', '8.5'])('rejects %p', (value) => {
    expect(dieSizeKey.safeParse(value).success).toBe(false);
  });
});

describe('uuid and isoDateTime', () => {
  it('accepts a crypto.randomUUID() value', () => {
    expect(uuid.safeParse(crypto.randomUUID()).success).toBe(true);
  });

  it('rejects a non-uuid string', () => {
    expect(uuid.safeParse('not-a-uuid').success).toBe(false);
  });

  it('accepts a Date.toISOString() value', () => {
    expect(isoDateTime.safeParse(new Date('2026-07-25T09:41:00.000Z').toISOString()).success).toBe(
      true,
    );
  });

  it('rejects a local-time string with no zone', () => {
    expect(isoDateTime.safeParse('2026-07-25 09:41').success).toBe(false);
  });
});

describe('currentAndTotal', () => {
  it('permits current above total, which is deliberate (spec §3.2)', () => {
    expect(currentAndTotal.parse({ current: 12, total: 4 })).toEqual({ current: 12, total: 4 });
  });

  it('rejects a negative current', () => {
    expect(currentAndTotal.safeParse({ current: -1, total: 4 }).success).toBe(false);
  });
});

describe('nameAndDescription', () => {
  it('requires both fields', () => {
    expect(nameAndDescription.safeParse({ name: 'Sneak Attack' }).success).toBe(false);
  });
});

describe('categorized', () => {
  const schema = categorized(nameAndDescription);

  it('accepts categories plus an uncategorized bucket', () => {
    const value = {
      categories: { Rogue: [{ name: 'Sneak Attack', description: '+3d6.' }] },
      uncategorized: [{ name: 'Darkvision', description: '60 ft.' }],
    };
    expect(schema.parse(value)).toEqual(value);
  });

  it('accepts an empty structure', () => {
    expect(schema.parse({ categories: {}, uncategorized: [] })).toEqual({
      categories: {},
      uncategorized: [],
    });
  });

  it('rejects a category name that is too long', () => {
    const value = {
      categories: { ['a'.repeat(MAX_CATEGORY_NAME + 1)]: [] },
      uncategorized: [],
    };
    expect(schema.safeParse(value).success).toBe(false);
  });

  it('preserves key insertion order through a JSON round-trip (spec §3.4)', () => {
    const value = {
      categories: { Zebra: [], Apple: [], Middle: [] },
      uncategorized: [],
    };
    const roundTripped = schema.parse(JSON.parse(JSON.stringify(value)));
    expect(Object.keys(roundTripped.categories)).toEqual(['Zebra', 'Apple', 'Middle']);
  });

  it('is a ZodObject, so document sections can extend it', () => {
    expect(schema).toBeInstanceOf(z.ZodObject);
  });
});
```

That order test is the one guarding §3.4. Dropping the order arrays rests on this behaviour, so it gets an explicit assertion rather than an assumption.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- primitives`
Expected: FAIL — cannot resolve `./primitives.js`.

- [ ] **Step 3: Implement the primitives**

Create `src/data/schema/v1/primitives.ts`:

```ts
import { z } from 'zod';

export const MAX_SHORT_NAME = 80;
export const MAX_CATEGORY_NAME = 40;
export const MAX_LONG_TEXT = 20_000;

/**
 * Names must arrive already trimmed. The schema deliberately does NOT trim:
 * `parseCharacter` returns the parsed value, so trimming here would silently
 * rewrite a stored or hand-edited document — the same silent repair that
 * unknown-key rejection exists to prevent. Trimming belongs at the write
 * boundary: the factory and the business layer's name-editing actions.
 * Internal whitespace is untouched.
 */
const isTrimmed = (value: string) => value === value.trim();
const NOT_TRIMMED = 'must not have leading or trailing whitespace';

export const shortName = z.string().min(1).max(MAX_SHORT_NAME).refine(isTrimmed, NOT_TRIMMED);
export const categoryName = z
  .string()
  .min(1)
  .max(MAX_CATEGORY_NAME)
  .refine(isTrimmed, NOT_TRIMMED);

/** Freeform prose. Not trimmed — leading whitespace may be deliberate. */
export const longText = z.string().max(MAX_LONG_TEXT);

export const nonNegativeInt = z.number().int().min(0);

/** The only signed fields are the three modifiers (spec §3.3). */
export const signedInt = z.number().int();

/** A hit-die size as it appears in JSON: digits, no leading zero. */
export const dieSizeKey = z.string().regex(/^[1-9]\d*$/, 'must be a positive integer without a leading zero');

// Zod's own validators, with the variants chosen deliberately. Measured against
// zod 4.4.3:
//   z.uuid()             accepts a nil UUID and a bogus version nibble — too loose.
//   z.uuidv4()           rejects both, and pins v4, which is all crypto.randomUUID() emits.
//   z.iso.datetime()     accepts 0, 1 or 6 fractional digits — too loose.
//   ...({ precision: 3 }) accepts exactly toISOString()'s shape, and unlike a regex
//                        it also rejects impossible dates such as month 13 or hour 99.
// The tests pin these choices down, because z.uuid() and bare z.iso.datetime() both
// look like harmless simplifications and would silently widen what we accept.
export const uuid = z.uuidv4();

export const isoDateTime = z.iso.datetime({ precision: 3 });

/** `current` is deliberately not checked against `total` (spec §3.2). */
export const currentAndTotal = z.object({
  current: nonNegativeInt,
  total: nonNegativeInt,
});

export const nameAndDescription = z.object({
  name: shortName,
  description: longText,
});

/**
 * Categorized<T> (spec §3.2). Display order is object-key insertion order,
 * so there is no order array — see §3.4.
 */
export const categorized = <Item extends z.ZodType>(item: Item) =>
  z.object({
    categories: z.record(categoryName, z.array(item)),
    uncategorized: z.array(item),
  });
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- primitives`
Expected: PASS, all cases.

If `z.record` complains about arity, this is Zod 3: it accepts `z.record(valueSchema)` with one argument. Pass both arguments as written — Zod 4 requires the key schema, and the installed version is Zod 4.

- [ ] **Step 5: Commit**

```bash
git add src/data/schema/README.md src/data/schema/v1/primitives.ts src/data/schema/v1/primitives.test.ts
git commit -m "feat: add Zod schema primitives with string, integer and ordering invariants"
```

---

## Task 3: The v1 document schema

**Files:**
- Create: `src/data/schema/v1/document.ts`, `src/data/schema/v1/index.ts`, `src/data/schema/index.ts`
- Test: `src/data/schema/v1/document.test.ts`

**Interfaces:**
- Consumes: everything from `primitives.ts`.
- Produces:
  - `characterDocumentV1Schema` — the Zod schema
  - `type CharacterDocumentV1 = z.infer<typeof characterDocumentV1Schema>`
  - `ABILITY_KEYS`, `SKILL_KEYS`, `SPELL_SLOT_LEVELS` — readonly tuples
  - from `index.ts`: `CURRENT = 1`, `SCHEMAS`, `type CharacterDocument = CharacterDocumentV1`

- [ ] **Step 1: Write the failing test**

Create `src/data/schema/v1/document.test.ts`. It needs a valid document to mutate, and `createCharacter` does not exist yet, so build one locally — this fixture also documents the shape precisely.

```ts
import { describe, expect, it } from 'vitest';
import { ABILITY_KEYS, SKILL_KEYS, SPELL_SLOT_LEVELS, characterDocumentV1Schema } from './document.js';

const ZERO = { current: 0, total: 0 };

function validDocument() {
  return {
    schemaVersion: 1 as const,
    id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
    name: 'Sable Nightwind',
    updatedAt: '2026-07-25T09:41:00.000Z',
    classes: {
      Rogue: { name: 'Rogue', level: 5 },
      Wizard: { name: 'Wizard', level: 2 },
    },
    hitPoints: { current: 38, total: 45, temporary: 5 },
    hitDices: { '8': { current: 3, total: 5 }, '6': { current: 2, total: 2 } },
    armorClass: 15,
    journalAndNotes: { journal: ['Arrived in Barovia.'], notes: 'Find the Sunsword.' },
    inventory: {
      coins: { pp: 2, gp: 84, ep: 0, sp: 37, cp: 12 },
      items: [{ name: "Thieves' Tools", description: 'For locks and traps.', count: 1 }],
    },
    featsAndTraits: {
      categories: { Rogue: [{ name: 'Sneak Attack', description: '+3d6.' }] },
      uncategorized: [{ name: 'Darkvision', description: '60 ft.' }],
    },
    equipment: {
      weapons: [
        { name: 'Rapier', description: '1d8 piercing.', attuned: false, equipped: true },
      ],
      other: [
        { name: 'Cloak of Elvenkind', description: 'Advantage on Stealth.', attuned: true, equipped: true },
      ],
    },
    spellList: {
      categories: {
        Combat: [{ name: 'Fireball', description: '8d6 fire.', level: 3, prepared: true }],
      },
      uncategorized: [{ name: 'Fire Bolt', description: '2d10 fire.', level: 'c', prepared: true }],
    },
    counters: {
      spellSlots: Object.fromEntries(SPELL_SLOT_LEVELS.map((level) => [level, ZERO])),
      categories: {
        'Class Features': [
          { name: 'Arcane Recovery', description: 'Once per day.', current: 1, total: 1 },
        ],
      },
      uncategorized: [],
    },
    abilitiesAndSkills: {
      proficiencyBonus: 3,
      passivePerception: 14,
      speed: 30,
      abilities: Object.fromEntries(
        ABILITY_KEYS.map((key) => [
          key,
          { score: 10, modifier: 0, savingThrowModifier: 0, savingThrowProficient: false },
        ]),
      ),
      skills: Object.fromEntries(
        SKILL_KEYS.map((key) => [key, { modifier: 0, proficient: false, expertise: false }]),
      ),
    },
  };
}

describe('characterDocumentV1Schema', () => {
  it('accepts a complete valid document', () => {
    expect(characterDocumentV1Schema.safeParse(validDocument()).success).toBe(true);
  });

  it('requires schemaVersion to be exactly 1', () => {
    const doc = { ...validDocument(), schemaVersion: 2 };
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('rejects an unknown top-level key, so typos surface instead of being dropped', () => {
    const doc = { ...validDocument(), levl: 7 };
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('rejects a stored `level`, because it is derived and must never be persisted', () => {
    const doc = { ...validDocument(), level: 7 };
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('rejects a class whose map key disagrees with its name (spec §3.3)', () => {
    const doc = validDocument();
    doc.classes = { Rogue: { name: 'Wizard', level: 5 } };
    const result = characterDocumentV1Schema.safeParse(doc);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/key/i);
    }
  });

  it('rejects a hit-dice key that is not a die size', () => {
    const doc = validDocument();
    doc.hitDices = { d8: { current: 1, total: 1 } } as never;
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('accepts "c" and 1 through 9 as spell levels, and rejects 0 and 10', () => {
    for (const level of ['c', 1, 5, 9]) {
      const doc = validDocument();
      doc.spellList.uncategorized[0]!.level = level as never;
      expect(characterDocumentV1Schema.safeParse(doc).success).toBe(true);
    }
    for (const level of [0, 10, '3']) {
      const doc = validDocument();
      doc.spellList.uncategorized[0]!.level = level as never;
      expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
    }
  });

  it('requires all nine spell-slot levels', () => {
    const doc = validDocument();
    delete (doc.counters.spellSlots as Record<string, unknown>)['9'];
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('requires all six abilities and all eighteen skills', () => {
    const withoutAbility = validDocument();
    delete (withoutAbility.abilitiesAndSkills.abilities as Record<string, unknown>).charisma;
    expect(characterDocumentV1Schema.safeParse(withoutAbility).success).toBe(false);

    const withoutSkill = validDocument();
    delete (withoutSkill.abilitiesAndSkills.skills as Record<string, unknown>).survival;
    expect(characterDocumentV1Schema.safeParse(withoutSkill).success).toBe(false);
  });

  it('rejects a `proficient` flag on an ability, which was dropped (spec §3.1)', () => {
    const doc = validDocument();
    (doc.abilitiesAndSkills.abilities as Record<string, object>).strength = {
      score: 10,
      modifier: 0,
      savingThrowModifier: 0,
      savingThrowProficient: false,
      proficient: true,
    };
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(false);
  });

  it('accepts negative modifiers on abilities and skills', () => {
    const doc = validDocument();
    (doc.abilitiesAndSkills.abilities as Record<string, { modifier: number }>).strength!.modifier =
      -1;
    (doc.abilitiesAndSkills.skills as Record<string, { modifier: number }>).stealth!.modifier = -2;
    expect(characterDocumentV1Schema.safeParse(doc).success).toBe(true);
  });

  it('rejects a negative armour class', () => {
    expect(
      characterDocumentV1Schema.safeParse({ ...validDocument(), armorClass: -1 }).success,
    ).toBe(false);
  });

  it('exposes 6 abilities, 18 skills and 9 spell-slot levels', () => {
    expect(ABILITY_KEYS).toHaveLength(6);
    expect(SKILL_KEYS).toHaveLength(18);
    expect(SPELL_SLOT_LEVELS).toHaveLength(9);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- document`
Expected: FAIL — cannot resolve `./document.js`.

- [ ] **Step 3: Implement the v1 schema**

Create `src/data/schema/v1/document.ts`:

```ts
import { z } from 'zod';
import {
  categorized,
  currentAndTotal,
  dieSizeKey,
  isoDateTime,
  longText,
  nameAndDescription,
  nonNegativeInt,
  shortName,
  signedInt,
  uuid,
} from './primitives.js';

export const ABILITY_KEYS = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

export const SKILL_KEYS = [
  'acrobatics',
  'animalHandling',
  'arcana',
  'athletics',
  'deception',
  'history',
  'insight',
  'intimidation',
  'investigation',
  'medicine',
  'nature',
  'perception',
  'performance',
  'persuasion',
  'religion',
  'sleightOfHand',
  'stealth',
  'survival',
] as const;

/** Spell-slot levels as they key the stored object: JSON stringifies numeric keys. */
export const SPELL_SLOT_LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

/** 'c' for cantrip, then 1..9 (spec §3.1). The wireframe's 0 is not authoritative. */
const spellLevel = z.union([
  z.literal('c'),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
]);

const classItem = z.object({ name: shortName, level: nonNegativeInt });

const inventoryItem = nameAndDescription.extend({ count: nonNegativeInt });

const equipmentItem = nameAndDescription.extend({
  attuned: z.boolean(),
  equipped: z.boolean(),
});

const spellListItem = nameAndDescription.extend({
  level: spellLevel,
  prepared: z.boolean(),
});

const countersItem = nameAndDescription.extend(currentAndTotal.shape);

/** No `proficient`: ability-check proficiency has no referent in the rules (spec §3.1). */
const abilitiesItem = z.object({
  score: nonNegativeInt,
  modifier: signedInt,
  savingThrowModifier: signedInt,
  savingThrowProficient: z.boolean(),
});

const skillsItem = z.object({
  modifier: signedInt,
  proficient: z.boolean(),
  expertise: z.boolean(),
});

const fixedKeys = <Key extends string, Value extends z.ZodType>(
  keys: readonly Key[],
  value: Value,
) =>
  z.object(
    Object.fromEntries(keys.map((key) => [key, value])) as Record<Key, Value>,
  );

const documentShape = z.object({
  schemaVersion: z.literal(1),
  id: uuid,
  name: shortName,
  updatedAt: isoDateTime,

  classes: z.record(shortName, classItem),

  hitPoints: currentAndTotal.extend({ temporary: nonNegativeInt }),
  hitDices: z.record(dieSizeKey, currentAndTotal),
  armorClass: nonNegativeInt,

  journalAndNotes: z.object({
    journal: z.array(longText),
    notes: longText,
  }),

  inventory: z.object({
    coins: z.object({
      pp: nonNegativeInt,
      gp: nonNegativeInt,
      ep: nonNegativeInt,
      sp: nonNegativeInt,
      cp: nonNegativeInt,
    }),
    items: z.array(inventoryItem),
  }),

  featsAndTraits: categorized(nameAndDescription),

  equipment: z.object({
    weapons: z.array(equipmentItem),
    other: z.array(equipmentItem),
  }),

  spellList: categorized(spellListItem),

  counters: categorized(countersItem).extend({
    spellSlots: fixedKeys(SPELL_SLOT_LEVELS, currentAndTotal),
  }),

  abilitiesAndSkills: z.object({
    proficiencyBonus: nonNegativeInt,
    passivePerception: nonNegativeInt,
    speed: nonNegativeInt,
    abilities: fixedKeys(ABILITY_KEYS, abilitiesItem),
    skills: fixedKeys(SKILL_KEYS, skillsItem),
  }),
});

export const characterDocumentV1Schema = documentShape.strict().superRefine((doc, ctx) => {
  for (const [key, value] of Object.entries(doc.classes)) {
    if (value.name !== key) {
      ctx.addIssue({
        code: 'custom',
        path: ['classes', key, 'name'],
        message: `class map key "${key}" must equal its name "${value.name}" (spec §3.3)`,
      });
    }
  }
});

export type CharacterDocumentV1 = z.infer<typeof characterDocumentV1Schema>;
```

`.strict()` is what makes the "rejects a stored `level`" test pass, and it is the mechanism preventing a derived value from ever creeping into a saved file.

If `ctx.addIssue({ code: 'custom' })` is rejected by the installed Zod's types, use `code: z.ZodIssueCode.custom` — the enum spelling is the Zod 3 form.

- [ ] **Step 4: Create v1's internal barrel and the schema registry**

Create `src/data/schema/v1/index.ts` — v1's public face inside `schema/`, so the registry never reaches past it:

```ts
export {
  ABILITY_KEYS,
  SKILL_KEYS,
  SPELL_SLOT_LEVELS,
  characterDocumentV1Schema,
  type CharacterDocumentV1,
} from './document.js';
```

Create `src/data/schema/index.ts` — the only entry point anything outside `schema/` imports:

```ts
import { z } from 'zod';
import { characterDocumentV1Schema, type CharacterDocumentV1 } from './v1/index.js';

/** The version this build writes. Bump when adding a schema version. */
export const CURRENT = 1;

/** Every historical schema, keyed by its version, for stepwise migration (spec §4). */
export const SCHEMAS: Readonly<Record<number, z.ZodType>> = {
  1: characterDocumentV1Schema,
};

/** The shape the business layer always sees. */
export type CharacterDocument = CharacterDocumentV1;

export { characterDocumentV1Schema, type CharacterDocumentV1 };
```

Deliberately **not** exported here: `ABILITY_KEYS`, `SKILL_KEYS` and `SPELL_SLOT_LEVELS`. They are v1 facts, and the only consumer outside `document.ts` is the blank factory, which Task 4 places beside them inside `v1/`. Exporting them version-neutrally would mean every consumer silently switched lists the day v2 renamed a skill.

Task 4 adds a `createCharacter` export to this file. When v2 arrives, this file gains a `2:` entry, and the `CharacterDocument` alias and the `createCharacter` re-export both point at v2 — and it is the *only* file outside a version directory that changes.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npm test
npm run typecheck
```

Expected: PASS and clean.

- [ ] **Step 6: Commit**

```bash
git add src/data/schema
git commit -m "feat: add v1 character document schema with cross-field invariants"
```

---

## Task 4: Blank character factory

**Files:**
- Create: `src/data/schema/v1/blank.ts`
- Test: `src/data/schema/v1/blank.test.ts`
- Modify: `src/data/schema/v1/index.ts` — re-export the factory
- Modify: `src/data/schema/index.ts` — re-export it as the current version's factory

**Interfaces:**
- Consumes, all colocated inside `v1/`: `CharacterDocumentV1`, `characterDocumentV1Schema`, `ABILITY_KEYS`, `SKILL_KEYS`, `SPELL_SLOT_LEVELS`.
- Produces: `createCharacter(input: CreateCharacterInput): CharacterDocumentV1` where
  `CreateCharacterInput = { name: string; id: string; now: Date }`, re-exported from
  `src/data/schema/index.ts` so Tasks 5–7 import it without naming a version.

The factory lives inside `v1/` because a blank document must satisfy its version's required fields — a v1 factory cannot produce a valid v2 document. It therefore belongs with the schema that defines what valid means, and it reads the key tuples colocated rather than through the public barrel.

Both `id` and `now` are injected rather than generated inside. A factory that reaches for `crypto.randomUUID()` and `new Date()` internally cannot be asserted against a fixed expectation, and the repository needs to control ids on import anyway.

- [ ] **Step 1: Write the failing test**

Create `src/data/schema/v1/blank.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createCharacter } from './blank.js';
import {
  ABILITY_KEYS,
  SKILL_KEYS,
  SPELL_SLOT_LEVELS,
  characterDocumentV1Schema,
} from './document.js';

const INPUT = {
  name: 'Wren Duskwhisper',
  id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
  now: new Date('2026-07-25T09:41:00.000Z'),
};

describe('createCharacter', () => {
  it('produces a document that passes the v1 schema', () => {
    const result = characterDocumentV1Schema.safeParse(createCharacter(INPUT));
    expect(result.success).toBe(true);
  });

  it('records the identity it was given', () => {
    const doc = createCharacter(INPUT);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.id).toBe(INPUT.id);
    expect(doc.name).toBe('Wren Duskwhisper');
    expect(doc.updatedAt).toBe('2026-07-25T09:41:00.000Z');
  });

  it('trims the supplied name', () => {
    expect(createCharacter({ ...INPUT, name: '  Wren  ' }).name).toBe('Wren');
  });

  it('starts with no classes, so total level is zero', () => {
    expect(createCharacter(INPUT).classes).toEqual({});
  });

  it('starts every collection empty', () => {
    const doc = createCharacter(INPUT);
    expect(doc.hitDices).toEqual({});
    expect(doc.journalAndNotes).toEqual({ journal: [], notes: '' });
    expect(doc.inventory.items).toEqual([]);
    expect(doc.equipment).toEqual({ weapons: [], other: [] });
    for (const section of [doc.featsAndTraits, doc.spellList, doc.counters]) {
      expect(section.categories).toEqual({});
      expect(section.uncategorized).toEqual([]);
    }
  });

  it('zeroes the numbers rather than guessing at D&D defaults', () => {
    const doc = createCharacter(INPUT);
    expect(doc.hitPoints).toEqual({ current: 0, total: 0, temporary: 0 });
    expect(doc.armorClass).toBe(0);
    expect(doc.inventory.coins).toEqual({ pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 });
    expect(doc.abilitiesAndSkills.proficiencyBonus).toBe(0);
    expect(doc.abilitiesAndSkills.passivePerception).toBe(0);
    expect(doc.abilitiesAndSkills.speed).toBe(0);
  });

  it('includes every ability, skill and spell-slot level', () => {
    const doc = createCharacter(INPUT);
    expect(Object.keys(doc.abilitiesAndSkills.abilities)).toEqual([...ABILITY_KEYS]);
    expect(Object.keys(doc.abilitiesAndSkills.skills)).toEqual([...SKILL_KEYS]);
    expect(Object.keys(doc.counters.spellSlots)).toEqual([...SPELL_SLOT_LEVELS]);
  });

  it('returns independent documents, not shared substructures', () => {
    const first = createCharacter(INPUT);
    const second = createCharacter(INPUT);
    first.inventory.items.push({ name: 'Rope', description: '', count: 1 });
    expect(second.inventory.items).toEqual([]);
  });
});
```

The last test guards a genuine hazard: a module-level constant object reused across documents would alias state between characters.

Note the zeroed numbers. A blank sheet does not assume speed 30 or a +2 proficiency bonus — the app computes nothing, and pre-filling values the player did not enter is exactly the guessing the spec forbids.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- blank`
Expected: FAIL — cannot resolve `./blank.js`.

- [ ] **Step 3: Implement the factory**

Create `src/data/schema/v1/blank.ts`, with a freeze header matching `document.ts`:

```ts
import {
  ABILITY_KEYS,
  SKILL_KEYS,
  SPELL_SLOT_LEVELS,
  type CharacterDocumentV1 as CharacterDocument,
} from './document.js';

export interface CreateCharacterInput {
  name: string;
  /** Injected so callers control identity; the repository assigns a fresh one on import. */
  id: string;
  /** Injected so the result is assertable. */
  now: Date;
}

const zero = () => ({ current: 0, total: 0 });

const emptyCategorized = <Item>() => ({
  categories: {} as Record<string, Item[]>,
  uncategorized: [] as Item[],
});

export function createCharacter({ name, id, now }: CreateCharacterInput): CharacterDocument {
  return {
    schemaVersion: 1,
    id,
    name: name.trim(),
    updatedAt: now.toISOString(),

    classes: {},

    hitPoints: { current: 0, total: 0, temporary: 0 },
    hitDices: {},
    armorClass: 0,

    journalAndNotes: { journal: [], notes: '' },

    inventory: {
      coins: { pp: 0, gp: 0, ep: 0, sp: 0, cp: 0 },
      items: [],
    },

    featsAndTraits: emptyCategorized(),

    equipment: { weapons: [], other: [] },

    spellList: emptyCategorized(),

    counters: {
      ...emptyCategorized(),
      spellSlots: Object.fromEntries(
        SPELL_SLOT_LEVELS.map((level) => [level, zero()]),
      ) as CharacterDocument['counters']['spellSlots'],
    },

    abilitiesAndSkills: {
      proficiencyBonus: 0,
      passivePerception: 0,
      speed: 0,
      abilities: Object.fromEntries(
        ABILITY_KEYS.map((key) => [
          key,
          { score: 0, modifier: 0, savingThrowModifier: 0, savingThrowProficient: false },
        ]),
      ) as CharacterDocument['abilitiesAndSkills']['abilities'],
      skills: Object.fromEntries(
        SKILL_KEYS.map((key) => [key, { modifier: 0, proficient: false, expertise: false }]),
      ) as CharacterDocument['abilitiesAndSkills']['skills'],
    },
  };
}
```

Every nested value is built inside the function call, so no two documents share a substructure.

- [ ] **Step 4: Re-export it through both barrels**

Add to `src/data/schema/v1/index.ts`:

```ts
export { createCharacter, type CreateCharacterInput } from './blank.js';
```

Add to `src/data/schema/index.ts` — a version-tracking export, the same treatment `CharacterDocument` gets, so Tasks 5–7 never name a version:

```ts
export { createCharacter, type CreateCharacterInput } from './v1/index.js';
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test -- blank`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/schema
git commit -m "feat: add blank character factory with injected id and timestamp"
```

---

## Task 5: Migration loop and error taxonomy

**Files:**
- Create: `src/data/migration/errors.ts`, `src/data/migration/versionOf.ts`, `src/data/migration/migrations.ts`, `src/data/migration/parseCharacter.ts`
- Test: `src/data/migration/errors.test.ts`, `src/data/migration/versionOf.test.ts`, `src/data/migration/parseCharacter.test.ts`

**Interfaces:**
- Consumes: `CURRENT`, `SCHEMAS`, `CharacterDocument`.
- Produces:
  - `type LoadError` — union of `{ code: 'UNVERSIONED' }`, `{ code: 'FROM_FUTURE'; found: number; current: number }`, `{ code: 'INVALID_AT_VERSION'; version: number; issues: SchemaIssue[] }`, `{ code: 'MIGRATION_FAILED'; version: number; cause: unknown }`
  - `type SchemaIssue = { path: string; message: string }`
  - `class CharacterLoadError extends Error` with a `detail: LoadError`
  - `type LoadResult = { ok: true; doc: CharacterDocument } | { ok: false; error: LoadError; raw: unknown }`
  - `versionOf(raw: unknown, current: number): number`
  - `type Migration = (doc: unknown) => unknown`
  - `interface MigrationRegistry { current: number; schemas: Readonly<Record<number, z.ZodType>>; migrations: ReadonlyMap<number, Migration> }`
  - `defaultRegistry: MigrationRegistry`
  - `parseCharacter(raw: unknown, registry?: MigrationRegistry): LoadResult`
  - `describeLoadError(error: LoadError): string`

`SchemaIssue` is our own shape rather than Zod's `ZodIssue`. That keeps the error type stable across Zod versions and means the UI never imports Zod.

**Why the registry is a parameter.** At schema v1 the migration loop never executes: `versionOf` returns 1, `CURRENT` is 1, and the body is skipped. Every branch that actually migrates — stepwise validation, a throwing migration, a missing migration — would therefore ship with no test at all, and would first run years later against a real file. Injecting the registry lets the tests build a synthetic two-version world and exercise the whole machine now. Production callers pass nothing and get `defaultRegistry`.

- [ ] **Step 1: Write the failing test for `versionOf`**

Create `src/data/migration/versionOf.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CharacterLoadError } from './errors.js';
import { versionOf } from './versionOf.js';

const CURRENT = 1;

const expectLoadError = (raw: unknown, code: string) => {
  try {
    versionOf(raw, CURRENT);
    throw new Error('expected versionOf to throw');
  } catch (caught) {
    expect(caught).toBeInstanceOf(CharacterLoadError);
    expect((caught as CharacterLoadError).detail.code).toBe(code);
  }
};

describe('versionOf', () => {
  it('reads a valid version', () => {
    expect(versionOf({ schemaVersion: 1 }, CURRENT)).toBe(1);
  });

  it('accepts an older version, which is what makes migration possible', () => {
    expect(versionOf({ schemaVersion: 1 }, 3)).toBe(1);
  });

  it.each([
    ['a missing field', {}],
    ['a string', { schemaVersion: '1' }],
    ['zero', { schemaVersion: 0 }],
    ['a negative number', { schemaVersion: -1 }],
    ['a fraction', { schemaVersion: 1.5 }],
    ['null', null],
    ['an array', []],
    ['a primitive', 42],
  ])('reports UNVERSIONED for %s', (_label, raw) => {
    expectLoadError(raw, 'UNVERSIONED');
  });

  it('reports FROM_FUTURE for a version this build does not know', () => {
    expectLoadError({ schemaVersion: 99 }, 'FROM_FUTURE');
  });

  it('carries both versions on FROM_FUTURE so the message can be specific', () => {
    try {
      versionOf({ schemaVersion: 99 }, CURRENT);
    } catch (caught) {
      expect((caught as CharacterLoadError).detail).toEqual({
        code: 'FROM_FUTURE',
        found: 99,
        current: 1,
      });
    }
  });
});
```

Also create `src/data/migration/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { describeLoadError } from './errors.js';

describe('describeLoadError', () => {
  it('explains an unversioned file', () => {
    expect(describeLoadError({ code: 'UNVERSIONED' })).toMatch(/schemaVersion/);
  });

  it('names both versions for a file from the future', () => {
    const message = describeLoadError({ code: 'FROM_FUTURE', found: 4, current: 1 });
    expect(message).toContain('4');
    expect(message).toContain('1');
  });

  it('lists the offending field paths for a schema failure', () => {
    const message = describeLoadError({
      code: 'INVALID_AT_VERSION',
      version: 1,
      issues: [{ path: 'armorClass', message: 'must be >= 0' }],
    });
    expect(message).toContain('armorClass: must be >= 0');
  });

  it('omits an empty path rather than printing a stray colon', () => {
    const message = describeLoadError({
      code: 'INVALID_AT_VERSION',
      version: 1,
      issues: [{ path: '', message: 'expected an object' }],
    });
    expect(message).toContain('expected an object');
    expect(message).not.toContain(': expected an object');
  });

  it('reports which version a failed migration started from', () => {
    expect(describeLoadError({ code: 'MIGRATION_FAILED', version: 2, cause: null })).toContain('2');
  });
});
```

These messages are user-facing copy shown when someone's character will not open, so they are tested rather than assumed.

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- versionOf`
Expected: FAIL — cannot resolve `./errors.js`.

- [ ] **Step 3: Implement the error types**

Create `src/data/migration/errors.ts`:

```ts
/** A schema complaint, flattened so no Zod type escapes the data layer. */
export interface SchemaIssue {
  /** Dotted path to the offending field, or '' for the document root. */
  path: string;
  message: string;
}

export type LoadError =
  | { code: 'UNVERSIONED' }
  | { code: 'FROM_FUTURE'; found: number; current: number }
  | { code: 'INVALID_AT_VERSION'; version: number; issues: SchemaIssue[] }
  | { code: 'MIGRATION_FAILED'; version: number; cause: unknown };

/** Thrown internally so the migration walk can bail out; converted to a LoadResult at the edge. */
export class CharacterLoadError extends Error {
  constructor(readonly detail: LoadError) {
    super(detail.code);
    this.name = 'CharacterLoadError';
  }
}

export function describeLoadError(error: LoadError): string {
  switch (error.code) {
    case 'UNVERSIONED':
      return 'This file has no usable schemaVersion, so it cannot be read as a character.';
    case 'FROM_FUTURE':
      return `This file was written by a newer version of the app (schema ${error.found}, this build understands ${error.current}). Update the app to open it.`;
    case 'INVALID_AT_VERSION': {
      const detail = error.issues
        .map((issue) => (issue.path === '' ? issue.message : `${issue.path}: ${issue.message}`))
        .join('; ');
      return `This file does not match schema version ${error.version}. ${detail}`;
    }
    case 'MIGRATION_FAILED':
      return `Upgrading this file from schema version ${error.version} failed.`;
  }
}
```

`describeLoadError` lives here, beside the codes, so adding a code forces the message to be written in the same edit. The `switch` is exhaustive and `noFallthroughCasesInSwitch` plus the union type make a missing case a compile error.

- [ ] **Step 4: Implement `versionOf`**

Create `src/data/migration/versionOf.ts`:

```ts
import { CharacterLoadError } from './errors.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads schemaVersion from an untrusted value.
 * Throws CharacterLoadError with UNVERSIONED or FROM_FUTURE.
 *
 * `current` is a parameter rather than an import so the migration machinery can
 * be tested against a synthetic version ceiling — see parseCharacter.
 */
export function versionOf(raw: unknown, current: number): number {
  if (!isRecord(raw)) {
    throw new CharacterLoadError({ code: 'UNVERSIONED' });
  }

  const found = raw.schemaVersion;
  if (typeof found !== 'number' || !Number.isInteger(found) || found < 1) {
    throw new CharacterLoadError({ code: 'UNVERSIONED' });
  }

  if (found > current) {
    throw new CharacterLoadError({ code: 'FROM_FUTURE', found, current });
  }

  return found;
}
```

Refusing a future version rather than attempting to read it is the point: a newer build may have added required fields, and a hopeful parse would either fail confusingly or silently discard them.

- [ ] **Step 5: Run the `versionOf` tests**

Run: `npm test -- versionOf`
Expected: PASS.

- [ ] **Step 6: Write the failing test for `parseCharacter`**

Create `src/data/migration/parseCharacter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createCharacter } from '../schema/index.js';
import type { Migration } from './migrations.js';
import { parseCharacter, type MigrationRegistry } from './parseCharacter.js';

const validRaw = () =>
  JSON.parse(
    JSON.stringify(
      createCharacter({
        name: 'Sable Nightwind',
        id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
        now: new Date('2026-07-25T09:41:00.000Z'),
      }),
    ),
  ) as unknown;

describe('parseCharacter', () => {
  it('returns the document for a valid current-version file', () => {
    const result = parseCharacter(validRaw());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.name).toBe('Sable Nightwind');
    }
  });

  it('reports UNVERSIONED and keeps the raw value for repair', () => {
    const raw = { anything: true };
    const result = parseCharacter(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('UNVERSIONED');
      expect(result.raw).toBe(raw);
    }
  });

  it('reports FROM_FUTURE without attempting to read the document', () => {
    const result = parseCharacter({ schemaVersion: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('FROM_FUTURE');
  });

  it('reports INVALID_AT_VERSION with flattened issue paths', () => {
    const raw = validRaw() as Record<string, unknown>;
    raw.armorClass = -5;
    const result = parseCharacter(raw);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'INVALID_AT_VERSION') {
      expect(result.error.version).toBe(1);
      expect(result.error.issues.some((issue) => issue.path === 'armorClass')).toBe(true);
    } else {
      throw new Error('expected INVALID_AT_VERSION');
    }
  });

  it('never repairs a bad document by substituting defaults', () => {
    const raw = validRaw() as Record<string, unknown>;
    delete raw.armorClass;
    const result = parseCharacter(raw);
    expect(result.ok).toBe(false);
  });

  it('leaves the caller\u2019s raw object untouched', () => {
    const raw = validRaw() as Record<string, unknown>;
    const before = JSON.stringify(raw);
    parseCharacter(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  it('rethrows a genuine bug instead of dressing it up as a corrupt file', () => {
    // A getter that throws stands in for any programming error inside the loader.
    const hostile = {
      get schemaVersion(): number {
        throw new TypeError('bug in the loader, not in the file');
      },
    };
    expect(() => parseCharacter(hostile)).toThrow(TypeError);
  });
});

// A synthetic two-version world, so the migration chain is exercised at v1 when
// no real second version exists yet. Version 1 is `{ v: 1, name }`; version 2
// renames `name` to `title`.
const V1 = z.object({ schemaVersion: z.literal(1), name: z.string() }).strict();
const V2 = z.object({ schemaVersion: z.literal(2), title: z.string() }).strict();

const oneToTwo: Migration = (doc) => {
  const from = doc as z.infer<typeof V1>;
  return { schemaVersion: 2, title: from.name };
};

const twoVersionRegistry = (migration: Migration = oneToTwo): MigrationRegistry => ({
  current: 2,
  schemas: { 1: V1, 2: V2 },
  migrations: new Map([[1, migration]]),
});

describe('parseCharacter migration chain', () => {
  it('migrates an old document forward to the current version', () => {
    const result = parseCharacter({ schemaVersion: 1, name: 'Sable' }, twoVersionRegistry());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc).toEqual({ schemaVersion: 2, title: 'Sable' });
    }
  });

  it('passes a document already at the current version straight through', () => {
    const result = parseCharacter({ schemaVersion: 2, title: 'Wren' }, twoVersionRegistry());
    expect(result.ok).toBe(true);
  });

  it('validates before migrating, so a bad v1 file never reaches the migration', () => {
    let called = false;
    const registry = twoVersionRegistry((doc) => {
      called = true;
      return oneToTwo(doc);
    });

    const result = parseCharacter({ schemaVersion: 1, name: 42 }, registry);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'INVALID_AT_VERSION') {
      expect(result.error.version).toBe(1);
    } else {
      throw new Error('expected INVALID_AT_VERSION at version 1');
    }
    expect(called).toBe(false);
  });

  it('reports MIGRATION_FAILED with the source version when a migration throws', () => {
    const registry = twoVersionRegistry(() => {
      throw new Error('could not derive title');
    });

    const result = parseCharacter({ schemaVersion: 1, name: 'Sable' }, registry);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'MIGRATION_FAILED') {
      expect(result.error.version).toBe(1);
      expect((result.error.cause as Error).message).toBe('could not derive title');
    } else {
      throw new Error('expected MIGRATION_FAILED');
    }
  });

  it('reports MIGRATION_FAILED when a migration produces something invalid', () => {
    const registry = twoVersionRegistry(() => ({ schemaVersion: 2 }));

    const result = parseCharacter({ schemaVersion: 1, name: 'Sable' }, registry);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The output failed the v2 schema, so it surfaces as invalid at version 2.
      expect(result.error.code).toBe('INVALID_AT_VERSION');
      if (result.error.code === 'INVALID_AT_VERSION') expect(result.error.version).toBe(2);
    }
  });

  it('reports MIGRATION_FAILED when no migration is registered for a version', () => {
    const registry: MigrationRegistry = {
      current: 2,
      schemas: { 1: V1, 2: V2 },
      migrations: new Map(),
    };

    const result = parseCharacter({ schemaVersion: 1, name: 'Sable' }, registry);
    expect(result.ok).toBe(false);
    if (!result.ok && result.error.code === 'MIGRATION_FAILED') {
      expect(result.error.version).toBe(1);
    } else {
      throw new Error('expected MIGRATION_FAILED');
    }
  });

  it('walks more than one step when a document is two versions behind', () => {
    const V3 = z.object({ schemaVersion: z.literal(3), title: z.string(), tag: z.string() }).strict();
    const registry: MigrationRegistry = {
      current: 3,
      schemas: { 1: V1, 2: V2, 3: V3 },
      migrations: new Map<number, Migration>([
        [1, oneToTwo],
        [2, (doc) => ({ ...(doc as object), schemaVersion: 3, tag: 'migrated' })],
      ]),
    };

    const result = parseCharacter({ schemaVersion: 1, name: 'Sable' }, registry);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc).toEqual({ schemaVersion: 3, title: 'Sable', tag: 'migrated' });
    }
  });
});
```

The two-step test is the one that catches an off-by-one in the loop bounds — a chain that stops one version short is the classic failure here, and it is invisible with only two versions.

That final test encodes a real distinction: a `LoadResult` failure means *your file is bad*. A programming mistake in the loader must not masquerade as one, or a bug becomes a phantom data-corruption report.

- [ ] **Step 7: Implement the migration registry**

Create `src/data/migration/migrations.ts`:

```ts
/** Migrates a document from version N to N+1. Pure; assumes its input already validated at N. */
export type Migration = (doc: unknown) => unknown;

/**
 * Keyed by source version. Empty at schema v1 — the first entry appears when
 * v2 is introduced, as `MIGRATIONS.set(1, migrateV1ToV2)`.
 */
export const MIGRATIONS = new Map<number, Migration>();
```

A `Map` rather than an object literal so `MIGRATIONS.get` is a real method that tests can stub, and so an absent migration is an explicit `undefined` rather than a prototype-chain surprise.

- [ ] **Step 8: Implement `parseCharacter`**

Create `src/data/migration/parseCharacter.ts`:

```ts
import type { z } from 'zod';
import { CURRENT, SCHEMAS, type CharacterDocument } from '../schema/index.js';
import { CharacterLoadError, type LoadError, type SchemaIssue } from './errors.js';
import { MIGRATIONS, type Migration } from './migrations.js';
import { versionOf } from './versionOf.js';

export type LoadResult =
  | { ok: true; doc: CharacterDocument }
  | { ok: false; error: LoadError; raw: unknown };

/** The schema and migration tables the walk uses. A parameter so tests can supply a fake. */
export interface MigrationRegistry {
  current: number;
  schemas: Readonly<Record<number, z.ZodType>>;
  migrations: ReadonlyMap<number, Migration>;
}

export const defaultRegistry: MigrationRegistry = {
  current: CURRENT,
  schemas: SCHEMAS,
  migrations: MIGRATIONS,
};

function validateAt(registry: MigrationRegistry, version: number, doc: unknown): unknown {
  const schema = registry.schemas[version];
  if (schema === undefined) {
    throw new CharacterLoadError({
      code: 'MIGRATION_FAILED',
      version,
      cause: `no schema registered for version ${version}`,
    });
  }

  const result = schema.safeParse(doc);
  if (!result.success) {
    const issues: SchemaIssue[] = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new CharacterLoadError({ code: 'INVALID_AT_VERSION', version, issues });
  }

  return result.data;
}

function runMigration(registry: MigrationRegistry, version: number, doc: unknown): unknown {
  const migration = registry.migrations.get(version);
  if (migration === undefined) {
    throw new CharacterLoadError({
      code: 'MIGRATION_FAILED',
      version,
      cause: `no migration registered for version ${version}`,
    });
  }

  try {
    return migration(doc);
  } catch (cause) {
    throw new CharacterLoadError({ code: 'MIGRATION_FAILED', version, cause });
  }
}

/** Validates before every migration step, so each migration may assume a well-formed input. */
function upgrade(raw: unknown, registry: MigrationRegistry): CharacterDocument {
  let doc: unknown = raw;

  for (let version = versionOf(raw, registry.current); version < registry.current; version++) {
    doc = validateAt(registry, version, doc);
    doc = runMigration(registry, version, doc);
  }

  return validateAt(registry, registry.current, doc) as CharacterDocument;
}

/**
 * Reads an untrusted value as a current-version character document,
 * migrating it forward if needed (spec §4). Never repairs or defaults.
 *
 * A failed LoadResult means the document is bad. A thrown error means this
 * loader is bad — those are rethrown rather than reported as data corruption.
 */
export function parseCharacter(
  raw: unknown,
  registry: MigrationRegistry = defaultRegistry,
): LoadResult {
  try {
    return { ok: true, doc: upgrade(raw, registry) };
  } catch (caught) {
    if (caught instanceof CharacterLoadError) {
      return { ok: false, error: caught.detail, raw };
    }
    throw caught;
  }
}
```

- [ ] **Step 9: Run all migration tests**

```bash
npm test -- migration
npm run typecheck
```

Expected: PASS and clean.

- [ ] **Step 10: Commit**

```bash
git add src/data/migration
git commit -m "feat: add versioned document loading with an explicit error taxonomy"
```

---

## Task 6: Serialization — export and import

**Files:**
- Create: `src/data/serialization/exportCharacter.ts`, `src/data/serialization/importCharacter.ts`
- Test: `src/data/serialization/exportCharacter.test.ts`, `src/data/serialization/importCharacter.test.ts`

**Interfaces:**
- Consumes: `slug`, `CharacterDocument`, `parseCharacter`, `LoadError`.
- Produces:
  - `toJsonText(doc: CharacterDocument): string`
  - `exportFilename(name: string, now: Date): string`
  - `type ParseTextResult = { ok: true; doc: CharacterDocument } | { ok: false; kind: 'syntax'; message: string } | { ok: false; kind: 'document'; error: LoadError; raw: unknown }`
  - `fromJsonText(text: string, options: { assignId: string }): ParseTextResult`

`ParseTextResult` distinguishes malformed *text* from a well-formed document that fails the schema. Spec §5 requires the raw-JSON editor to report those differently, and §4's four codes only describe already-parsed values, so text-level failure needs its own case.

- [ ] **Step 1: Write the failing export test**

Create `src/data/serialization/exportCharacter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../schema/index.js';
import { exportFilename, toJsonText } from './exportCharacter.js';

const doc = createCharacter({
  name: 'Sable Nightwind',
  id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
  now: new Date('2026-07-25T09:41:00.000Z'),
});

describe('toJsonText', () => {
  it('pretty-prints with two-space indentation, so the file is diffable', () => {
    const text = toJsonText(doc);
    expect(text.split('\n').length).toBeGreaterThan(20);
    expect(text).toContain('\n  "id": "3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e"');
  });

  it('ends with a newline, as text files should', () => {
    expect(toJsonText(doc).endsWith('\n')).toBe(true);
  });

  it('round-trips through JSON.parse unchanged', () => {
    expect(JSON.parse(toJsonText(doc))).toEqual(doc);
  });
});

describe('exportFilename', () => {
  it('combines a slug and the date', () => {
    expect(exportFilename('Sable Nightwind', new Date('2026-07-25T09:41:00.000Z'))).toBe(
      'sable-nightwind-2026-07-25.json',
    );
  });

  it('uses the UTC date, so the name does not shift with the local zone', () => {
    expect(exportFilename('Wren', new Date('2026-07-25T23:30:00.000Z'))).toBe(
      'wren-2026-07-25.json',
    );
  });

  it('stays usable when the name has no alphanumerics', () => {
    expect(exportFilename('***', new Date('2026-07-25T09:41:00.000Z'))).toBe(
      'character-2026-07-25.json',
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- exportCharacter`
Expected: FAIL — cannot resolve `./exportCharacter.js`.

- [ ] **Step 3: Implement export**

Create `src/data/serialization/exportCharacter.ts`:

```ts
import { slug } from '../../shared/slug.js';
import type { CharacterDocument } from '../schema/index.js';

/**
 * Pretty-printed on purpose: an exported file exists to be kept in a folder,
 * synced, committed to git and occasionally hand-edited (spec §5).
 */
export function toJsonText(doc: CharacterDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** e.g. `sable-nightwind-2026-07-25.json` — sorts chronologically per character. */
export function exportFilename(name: string, now: Date): string {
  return `${slug(name)}-${now.toISOString().slice(0, 10)}.json`;
}
```

- [ ] **Step 4: Run the export tests**

Run: `npm test -- exportCharacter`
Expected: PASS.

- [ ] **Step 5: Write the failing import test**

Create `src/data/serialization/importCharacter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../schema/index.js';
import { toJsonText } from './exportCharacter.js';
import { fromJsonText } from './importCharacter.js';

const ORIGINAL_ID = '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e';
const NEW_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const exported = () =>
  toJsonText(
    createCharacter({
      name: 'Sable Nightwind',
      id: ORIGINAL_ID,
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('fromJsonText', () => {
  it('reads a document this app exported', () => {
    const result = fromJsonText(exported(), { assignId: NEW_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.name).toBe('Sable Nightwind');
  });

  it('always assigns the new id, so import can never overwrite a character', () => {
    const result = fromJsonText(exported(), { assignId: NEW_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.id).toBe(NEW_ID);
  });

  it('preserves everything except the id', () => {
    const result = fromJsonText(exported(), { assignId: NEW_ID });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const original = JSON.parse(exported()) as Record<string, unknown>;
      expect({ ...result.doc, id: ORIGINAL_ID }).toEqual(original);
    }
  });

  it('reports a syntax failure separately from a schema failure', () => {
    const result = fromJsonText('{ "schemaVersion": 1, ', { assignId: NEW_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('syntax');
  });

  it('includes the parser message so the editor can point at the problem', () => {
    const result = fromJsonText('nonsense', { assignId: NEW_ID });
    expect(result.ok).toBe(false);
    if (!result.ok && result.kind === 'syntax') {
      expect(result.message.length).toBeGreaterThan(0);
    } else {
      throw new Error('expected a syntax failure');
    }
  });

  it('reports a document failure for well-formed JSON that is not a character', () => {
    const result = fromJsonText('{"schemaVersion": 1}', { assignId: NEW_ID });
    expect(result.ok).toBe(false);
    if (!result.ok && result.kind === 'document') {
      expect(result.error.code).toBe('INVALID_AT_VERSION');
      expect(result.raw).toEqual({ schemaVersion: 1 });
    } else {
      throw new Error('expected a document failure');
    }
  });

  it('treats an empty file as a syntax failure, not an empty character', () => {
    const result = fromJsonText('', { assignId: NEW_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('syntax');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test -- importCharacter`
Expected: FAIL — cannot resolve `./importCharacter.js`.

- [ ] **Step 7: Implement import**

Create `src/data/serialization/importCharacter.ts`:

```ts
import type { LoadError } from '../migration/errors.js';
import { parseCharacter } from '../migration/parseCharacter.js';
import type { CharacterDocument } from '../schema/index.js';

export type ParseTextResult =
  | { ok: true; doc: CharacterDocument }
  | { ok: false; kind: 'syntax'; message: string }
  | { ok: false; kind: 'document'; error: LoadError; raw: unknown };

export interface FromJsonTextOptions {
  /** The id the imported character will take. Import always creates (spec §5). */
  assignId: string;
}

/**
 * Reads JSON text as a character. Malformed text and an invalid document are
 * reported as different kinds, because the raw-JSON editor presents them
 * differently — a caret position versus a list of field paths (spec §5).
 */
export function fromJsonText(text: string, { assignId }: FromJsonTextOptions): ParseTextResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (caught) {
    return {
      ok: false,
      kind: 'syntax',
      message: caught instanceof Error ? caught.message : 'The file is not valid JSON.',
    };
  }

  const parsed = parseCharacter(raw);
  if (!parsed.ok) {
    return { ok: false, kind: 'document', error: parsed.error, raw: parsed.raw };
  }

  return { ok: true, doc: { ...parsed.doc, id: assignId } };
}
```

- [ ] **Step 8: Run all serialization tests**

```bash
npm test -- serialization
npm run typecheck
```

Expected: PASS and clean.

- [ ] **Step 9: Commit**

```bash
git add src/data/serialization
git commit -m "feat: add character export and import with distinct syntax and schema failures"
```

---

## Task 7: IndexedDB repository

**Files:**
- Create: `src/data/repository/types.ts`, `src/data/repository/summarize.ts`, `src/data/repository/indexedDbRepository.ts`
- Test: `src/data/repository/summarize.test.ts`, `src/data/repository/indexedDbRepository.test.ts`
- Modify: `vitest.config.ts` — add the `fake-indexeddb` setup file
- Create: `src/test/setupIndexedDb.ts`

**Interfaces:**
- Consumes: `CharacterDocument`, `parseCharacter`, `LoadResult`, `LoadError`.
- Produces:
  - `interface CharacterSummary { id: string; name: string; totalLevel: number; classes: { name: string; level: number }[]; hitPoints: { current: number; total: number; temporary: number } }`
  - `type ListEntry = { ok: true; summary: CharacterSummary } | { ok: false; id: string; error: LoadError }`
  - `interface CharacterRepository { list(): Promise<ListEntry[]>; get(id): Promise<LoadResult | null>; getRaw(id): Promise<unknown>; save(doc): Promise<void>; delete(id): Promise<void> }`
  - `summarize(doc: CharacterDocument): CharacterSummary`
  - `createIndexedDbRepository(): CharacterRepository`

Two refinements on spec §5, both required by criteria 15 and 6:

- `list()` returns `ListEntry[]`, not `CharacterSummary[]`. A damaged document must still appear in the list, and a summary cannot be built from one.
- `getRaw(id)` is added so the raw-JSON editor can be seeded with the stored text of a document that will not parse.

- [ ] **Step 1: Add the `fake-indexeddb` test setup**

Create `src/test/setupIndexedDb.ts`:

```ts
// Installs an in-memory IndexedDB on globalThis for tests.
import 'fake-indexeddb/auto';
```

Modify `vitest.config.ts` — add `setupFiles` inside `test`:

```ts
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setupIndexedDb.ts'],
  },
```

- [ ] **Step 2: Write the failing test for `summarize`**

Create `src/data/repository/summarize.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../schema/index.js';
import { summarize } from './summarize.js';

const base = () =>
  createCharacter({
    name: 'Sable Nightwind',
    id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
    now: new Date('2026-07-25T09:41:00.000Z'),
  });

describe('summarize', () => {
  it('carries identity and hit points across', () => {
    const doc = base();
    doc.hitPoints = { current: 38, total: 45, temporary: 5 };
    const summary = summarize(doc);
    expect(summary.id).toBe(doc.id);
    expect(summary.name).toBe('Sable Nightwind');
    expect(summary.hitPoints).toEqual({ current: 38, total: 45, temporary: 5 });
  });

  it('sums class levels into totalLevel', () => {
    const doc = base();
    doc.classes = { Rogue: { name: 'Rogue', level: 5 }, Wizard: { name: 'Wizard', level: 2 } };
    expect(summarize(doc).totalLevel).toBe(7);
  });

  it('reports totalLevel 0 for a character with no classes', () => {
    expect(summarize(base()).totalLevel).toBe(0);
  });

  it('flattens classes in creation order (spec §3.4)', () => {
    const doc = base();
    doc.classes = {
      Wizard: { name: 'Wizard', level: 2 },
      Rogue: { name: 'Rogue', level: 5 },
    };
    expect(summarize(doc).classes).toEqual([
      { name: 'Wizard', level: 2 },
      { name: 'Rogue', level: 5 },
    ]);
  });

  it('does not mutate the document it summarises', () => {
    const doc = base();
    const before = JSON.stringify(doc);
    summarize(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm test -- summarize`
Expected: FAIL — cannot resolve `./summarize.js`.

- [ ] **Step 4: Implement `types.ts` and `summarize.ts`**

Create `src/data/repository/types.ts`:

```ts
import type { LoadError } from '../migration/errors.js';
import type { LoadResult } from '../migration/parseCharacter.js';
import type { CharacterDocument } from '../schema/index.js';

export interface CharacterSummary {
  id: string;
  name: string;
  /** Derived while mapping. Never stored (spec §1). */
  totalLevel: number;
  /** Flattened in creation order for display. */
  classes: { name: string; level: number }[];
  hitPoints: { current: number; total: number; temporary: number };
}

/**
 * A row of the character list. A document that will not load still appears,
 * flagged, so it can be repaired rather than vanishing (criterion 15).
 */
export type ListEntry =
  | { ok: true; summary: CharacterSummary }
  | { ok: false; id: string; error: LoadError };

export interface CharacterRepository {
  list(): Promise<ListEntry[]>;
  /** null when no such id exists; a failed LoadResult when it exists but is damaged. */
  get(id: string): Promise<LoadResult | null>;
  /** The stored value with no validation, to seed the raw-JSON editor (spec §5). */
  getRaw(id: string): Promise<unknown>;
  save(doc: CharacterDocument): Promise<void>;
  delete(id: string): Promise<void>;
}
```

Create `src/data/repository/summarize.ts`:

```ts
import type { CharacterDocument } from '../schema/index.js';
import type { CharacterSummary } from './types.js';

export function summarize(doc: CharacterDocument): CharacterSummary {
  const classes = Object.values(doc.classes).map(({ name, level }) => ({ name, level }));

  return {
    id: doc.id,
    name: doc.name,
    totalLevel: classes.reduce((total, entry) => total + entry.level, 0),
    classes,
    hitPoints: { ...doc.hitPoints },
  };
}
```

- [ ] **Step 5: Run the summarize tests**

Run: `npm test -- summarize`
Expected: PASS.

- [ ] **Step 6: Write the failing repository test**

Create `src/data/repository/indexedDbRepository.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { createCharacter } from '../schema/index.js';
import {
  CHARACTER_STORE,
  DB_NAME,
  createIndexedDbRepository,
  openDb,
} from './indexedDbRepository.js';

const ID_A = '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e';
const ID_B = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const docFor = (id: string, name: string) =>
  createCharacter({ name, id, now: new Date('2026-07-25T09:41:00.000Z') });

/** Writes a value straight into the store, bypassing validation, to simulate damage. */
async function putRaw(id: string, value: unknown): Promise<void> {
  const db = await openDb();
  await db.put(CHARACTER_STORE, value, id);
  db.close();
}

async function wipe(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

describe('createIndexedDbRepository', () => {
  beforeEach(wipe);

  it('starts empty', async () => {
    const repository = createIndexedDbRepository();
    expect(await repository.list()).toEqual([]);
  });

  it('saves and reads a document back unchanged', async () => {
    const repository = createIndexedDbRepository();
    const doc = docFor(ID_A, 'Sable Nightwind');
    await repository.save(doc);

    const loaded = await repository.get(ID_A);
    expect(loaded?.ok).toBe(true);
    if (loaded?.ok) expect(loaded.doc).toEqual(doc);
  });

  it('returns null for an id that was never stored', async () => {
    const repository = createIndexedDbRepository();
    expect(await repository.get(ID_A)).toBeNull();
  });

  it('overwrites on a second save of the same id', async () => {
    const repository = createIndexedDbRepository();
    await repository.save(docFor(ID_A, 'Sable Nightwind'));
    await repository.save({ ...docFor(ID_A, 'Sable Nightwind'), armorClass: 18 });

    const loaded = await repository.get(ID_A);
    expect(loaded?.ok).toBe(true);
    if (loaded?.ok) expect(loaded.doc.armorClass).toBe(18);
  });

  it('lists a summary per stored character', async () => {
    const repository = createIndexedDbRepository();
    await repository.save(docFor(ID_A, 'Sable Nightwind'));
    await repository.save(docFor(ID_B, 'Wren Duskwhisper'));

    const entries = await repository.list();
    expect(entries).toHaveLength(2);
    const names = entries.flatMap((entry) => (entry.ok ? [entry.summary.name] : []));
    expect(names.sort()).toEqual(['Sable Nightwind', 'Wren Duskwhisper']);
  });

  it('deletes a character', async () => {
    const repository = createIndexedDbRepository();
    await repository.save(docFor(ID_A, 'Sable Nightwind'));
    await repository.delete(ID_A);

    expect(await repository.get(ID_A)).toBeNull();
    expect(await repository.list()).toEqual([]);
  });

  it('deleting an absent id is not an error', async () => {
    const repository = createIndexedDbRepository();
    await expect(repository.delete(ID_A)).resolves.toBeUndefined();
  });

  it('still lists a damaged document, flagged, rather than hiding it (criterion 15)', async () => {
    await putRaw(ID_A, { schemaVersion: 1, name: 'Broken' });
    const repository = createIndexedDbRepository();

    const entries = await repository.list();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.ok).toBe(false);
    if (entries[0]?.ok === false) {
      expect(entries[0].id).toBe(ID_A);
      expect(entries[0].error.code).toBe('INVALID_AT_VERSION');
    }
  });

  it('one damaged document does not hide the healthy ones', async () => {
    const repository = createIndexedDbRepository();
    await repository.save(docFor(ID_B, 'Wren Duskwhisper'));
    await putRaw(ID_A, { nonsense: true });

    const entries = await repository.list();
    expect(entries).toHaveLength(2);
    expect(entries.filter((entry) => entry.ok)).toHaveLength(1);
    expect(entries.filter((entry) => !entry.ok)).toHaveLength(1);
  });

  it('reports a damaged document through get() rather than throwing', async () => {
    await putRaw(ID_A, { schemaVersion: 99 });
    const repository = createIndexedDbRepository();

    const loaded = await repository.get(ID_A);
    expect(loaded?.ok).toBe(false);
    if (loaded && !loaded.ok) expect(loaded.error.code).toBe('FROM_FUTURE');
  });

  it('getRaw returns the stored value verbatim for repair', async () => {
    const damaged = { schemaVersion: 1, name: 'Broken' };
    await putRaw(ID_A, damaged);
    const repository = createIndexedDbRepository();

    expect(await repository.getRaw(ID_A)).toEqual(damaged);
  });

  it('refuses to save a document that does not validate', async () => {
    const repository = createIndexedDbRepository();
    const invalid = { ...docFor(ID_A, 'Sable Nightwind'), armorClass: -1 };
    await expect(repository.save(invalid)).rejects.toThrow();
    expect(await repository.list()).toEqual([]);
  });
});
```

The last test is the storage-side guard for §6's rule that a failed validation refuses the write. Nothing invalid should ever reach the store, so the store itself checks.

- [ ] **Step 7: Run it to verify it fails**

Run: `npm test -- indexedDbRepository`
Expected: FAIL — cannot resolve `./indexedDbRepository.js`.

- [ ] **Step 8: Implement the repository**

Create `src/data/repository/indexedDbRepository.ts`:

```ts
import { openDB, type IDBPDatabase } from 'idb';
import { parseCharacter, type LoadResult } from '../migration/parseCharacter.js';
import { characterDocumentV1Schema, type CharacterDocument } from '../schema/index.js';
import { summarize } from './summarize.js';
import type { CharacterRepository, ListEntry } from './types.js';

export const DB_NAME = 'dnd-character-sheet';
export const DB_VERSION = 1;
export const CHARACTER_STORE = 'characters';

/**
 * Out-of-line keys, not a keyPath. The key must stay readable even when the
 * stored value is damaged, so a broken document can still be listed and opened.
 */
export function openDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(CHARACTER_STORE)) {
        db.createObjectStore(CHARACTER_STORE);
      }
    },
  });
}

export function createIndexedDbRepository(): CharacterRepository {
  return {
    async list(): Promise<ListEntry[]> {
      const db = await openDb();
      try {
        const entries: ListEntry[] = [];
        let cursor = await db.transaction(CHARACTER_STORE).store.openCursor();

        while (cursor) {
          const id = String(cursor.key);
          const parsed = parseCharacter(cursor.value);
          entries.push(
            parsed.ok
              ? { ok: true, summary: summarize(parsed.doc) }
              : { ok: false, id, error: parsed.error },
          );
          cursor = await cursor.continue();
        }

        return entries;
      } finally {
        db.close();
      }
    },

    async get(id: string): Promise<LoadResult | null> {
      const db = await openDb();
      try {
        const stored: unknown = await db.get(CHARACTER_STORE, id);
        if (stored === undefined) return null;
        return parseCharacter(stored);
      } finally {
        db.close();
      }
    },

    async getRaw(id: string): Promise<unknown> {
      const db = await openDb();
      try {
        return (await db.get(CHARACTER_STORE, id)) as unknown;
      } finally {
        db.close();
      }
    },

    async save(doc: CharacterDocument): Promise<void> {
      // Validate at the boundary: an invalid document must never reach storage (spec §6).
      const validated = characterDocumentV1Schema.parse(doc);

      const db = await openDb();
      try {
        await db.put(CHARACTER_STORE, validated, validated.id);
      } finally {
        db.close();
      }
    },

    async delete(id: string): Promise<void> {
      const db = await openDb();
      try {
        await db.delete(CHARACTER_STORE, id);
      } finally {
        db.close();
      }
    },
  };
}
```

- [ ] **Step 9: Run the whole suite**

```bash
npm test
npm run lint
npm run typecheck
```

Expected: every test PASS, lint clean, typecheck clean.

- [ ] **Step 10: Commit**

```bash
git add src/data/repository src/test vitest.config.ts
git commit -m "feat: add IndexedDB character repository that lists damaged documents"
```

---

## Definition of done for this plan

- [ ] `npm test` passes with no skipped tests
- [ ] `npm run lint` and `npm run typecheck` are clean
- [ ] The layer-boundary rule has been seen to fail (Task 1 Step 11)
- [ ] A document can be created, validated, exported, re-imported under a new id, saved, listed and deleted, entirely through `src/data/`
- [ ] All four `LoadError` codes have a test, and a damaged document is listed rather than hidden

Spec coverage from §8's criteria: this plan implements the storage and validation halves of 8, 9, 10 and 15. The rest need the business layer (plan 2) and UI (plan 3).

## Follow-on plans

**Plan 2 — business layer:** `CharacterStore` with derived values, the rule-carrying actions for classes, hit dice and categories, autosave via `deepObserve` with flush-on-hide, `CharacterLibrary`, and the persistence-gate state machine.

**Plan 3 — UI:** theme and router, `ResponsiveDialog`, the persistence gate, character list, vitals header, hub grid, the Feats & Traits section, the raw-JSON editor, Storybook and the PWA manifest.
