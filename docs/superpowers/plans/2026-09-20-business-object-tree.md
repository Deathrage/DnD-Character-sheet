# Business Object Tree Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the observable business-object tree that makes the character document private and unreachable, so every UI read and write goes through a named method that cannot leave the document in a state the schema would reject.

**Architecture:** One `CharacterSheetBO` owns the document in a `#doc` private field, wrapped once in `observable()`. Every other business object holds a parent reference and its own node, carries no MobX annotation, and reads through that single observable. Derived values live on the objects, never in the document. Writes that break a rule throw `RuleViolation`.

**Tech Stack:** TypeScript 6 (strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`), MobX 6, Zod 4.4.3 (via the data layer only), Vitest 4.

**Spec:** `docs/superpowers/specs/2026-09-20-business-layer-design.md` — §3 (conventions) and §4 (the object tree). §5–6 (library, files, storage, autosave) are a separate plan and are out of scope here.

## Global Constraints

- **Every commit must leave `npm test`, `npm run typecheck` and `npm run lint` green**, and `npx prettier --check .` passing.
- **Prove every new test bites.** Break the thing it guards, watch that test and only that test fail, then restore. If an experiment cannot isolate a single test, say so explicitly rather than reporting it clean.
- **Verify APIs against the installed version, never from memory.** MobX 6, TypeScript 6 and Vitest 4 all differ from earlier majors.
- **`src/business/` may import `src/data` and `src/shared`, never `src/ui`,** and never a schema version directory (`src/data/schema/v1/…`). These are ESLint rules in `eslint.config.js`, not conventions. Import from `src/data/schema/index.js` — the public barrel.
- **The document is held in a `#doc` private field**, not a TypeScript `private` one. `private` is erased at compile time; `#` is enforced by the runtime, and runtime enforcement is the entire point of this layer.
- **A business object holds a reference to its node and never a copy of a value.** Cache a name or mirror a list once and memory and file can disagree. `toJS(#doc)` must remain literally the file.
- **Business objects carry no MobX annotation.** No `makeAutoObservable`, no `makeObservable`, no decorators. All observability comes from the single `observable(doc)` in `CharacterSheetBO`.
- **Names are trimmed by every setter that writes one, then rejected if empty.** This is the write boundary the schema's no-trim rule defers to — the schema rejects padded names rather than trimming them, because trimming on load would rewrite a stored document.
- **Numbers are guarded, not validated.** The UI contract is that a numeric input holds its half-typed string locally and calls the setter only when the text parses, so `''`, `-` and `1e` never arrive. Guards catch bugs, not keystrokes.
- **Every write that breaks a rule throws `RuleViolation`.** One mechanism, not two.
- **`tsconfig.json` sets `noUncheckedIndexedAccess`**, so `array[i]` is `T | undefined`. Handle it; do not silence it with `!` unless the index was just proven in the same expression.
- **`verbatimModuleSyntax` is on** — type-only imports must use `import type`.
- **Relative imports carry the `.js` extension**, matching the existing codebase (`./document.js`, not `./document`).
- **Conventional Commit prefixes**, small commits, tests written before implementation.
- **`.prettierignore` excludes `docs/start/` and `docs/superpowers/`.** Do not reformat them; never touch `docs/start/`.

---

### Task 1: Foundations — ids, errors, guards

Three small modules every later task depends on. No business object exists yet.

**Files:**

- Create: `src/business/createId.ts`, `src/business/errors.ts`, `src/business/guards.ts`
- Test: `src/business/createId.test.ts`, `src/business/guards.test.ts`

**Interfaces:**

- Produces: `createId(): string`; `class RuleViolation extends Error { readonly code: RuleCode }`; `type RuleCode`; `trimmedName(value: string): string`; `nonNegativeInt(value: number): number`; `integer(value: number): number`

- [ ] **Step 1: Write the failing tests for `createId`**

```ts
// src/business/createId.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId } from './createId.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('produces a v4 uuid', () => {
    expect(createId()).toMatch(V4);
  });

  it('produces a different id each call', () => {
    expect(createId()).not.toBe(createId());
  });

  // crypto.randomUUID exists only in a secure context. Over plain HTTP — a phone hitting
  // http://192.168.x.x:5173 on the LAN, which is how a mobile-first PWA actually gets tested —
  // it is undefined. crypto.getRandomValues has no such restriction, so the fallback uses it.
  it('still produces a v4 uuid when randomUUID is unavailable, as on a non-secure origin', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('not available');
    });
    expect(createId()).toMatch(V4);
  });

  it('sets the version and variant bits itself in the fallback, rather than trusting raw bytes', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('not available');
    });
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
      array.fill(0xff);
      return array;
    }) as typeof crypto.getRandomValues);

    const id = createId();
    expect(id).toMatch(V4);
    expect(id[14]).toBe('4');
    expect(id[19]).toBe('b');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/business/createId.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `createId`**

```ts
// src/business/createId.ts

/**
 * Mints an id for an item stored in a character document. Every id in a document comes from
 * here; the data layer never generates one, because a blank document contains only empty
 * collections.
 *
 * Deliberately not injectable, unlike `createCharacter`'s `id` and `now`. Injection would buy
 * deterministic ids in tests, and the business tests barely want them — rule tests use whatever
 * id `add()` returned. That is cheaper than threading a constructor parameter through sixteen
 * classes, and it leaves one place for the fallback below.
 */
export function createId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return fallbackV4();
  }
}

/**
 * `crypto.randomUUID` is available only in a secure context. `crypto.getRandomValues` is not
 * restricted that way, so it works on the plain-HTTP LAN origin a phone uses to test the app.
 * The version and variant bits are set here rather than trusted from the random bytes, because
 * the schema validates with `z.uuidv4()`, which checks both.
 */
function fallbackV4(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
```

- [ ] **Step 4: Verify the fallback against the real schema, not just a regex**

A regex that happens to match is weaker than the validator the document actually uses. Add this test to `createId.test.ts`:

```ts
it('produces an id the document schema accepts, in both paths', () => {
  const accepted = (id: string) =>
    CURRENT_SCHEMA.safeParse({ ...createCharacter({ name: 'X', id, now: new Date() }) }).success;

  expect(accepted(createId())).toBe(true);

  vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
    throw new TypeError('not available');
  });
  expect(accepted(createId())).toBe(true);
});
```

with `import { CURRENT_SCHEMA, createCharacter } from '../data/schema/index.js';` at the top.

- [ ] **Step 5: Write `errors.ts` and `guards.ts` with their tests**

```ts
// src/business/errors.ts

/**
 * Every rule this layer enforces. Most mean a UI bug and should be loud; DUPLICATE_NAME is the
 * one the UI is expected to catch and present, because a player can type a name that is already
 * in use and deserves a message rather than a crash.
 */
export type RuleCode =
  | 'DUPLICATE_NAME'
  | 'EMPTY_NAME'
  | 'DUPLICATE_DIE'
  | 'NOT_AN_INTEGER'
  | 'NEGATIVE'
  | 'UNKNOWN_CATEGORY'
  | 'GONE';

export class RuleViolation extends Error {
  constructor(
    readonly code: RuleCode,
    message: string,
  ) {
    super(message);
    this.name = 'RuleViolation';
  }
}
```

```ts
// src/business/guards.ts
import { RuleViolation } from './errors.js';

/**
 * Trims at the write boundary, then rejects an empty result. The schema rejects a padded name
 * rather than trimming it, because `parseCharacter` returns the parsed value and trimming on
 * load would silently rewrite a stored document. Trimming here is not a surprise: the player
 * just typed it.
 */
export function trimmedName(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new RuleViolation('EMPTY_NAME', 'a name must not be empty');
  }
  return trimmed;
}

/**
 * A safety net against a business-layer bug, not input validation. The UI contract is that a
 * numeric input holds its half-typed text locally and calls a setter only once it parses.
 */
export function integer(value: number): number {
  if (!Number.isInteger(value)) {
    throw new RuleViolation('NOT_AN_INTEGER', `expected an integer, got ${value}`);
  }
  return value;
}

export function nonNegativeInt(value: number): number {
  if (integer(value) < 0) {
    throw new RuleViolation('NEGATIVE', `expected a non-negative integer, got ${value}`);
  }
  return value;
}
```

```ts
// src/business/guards.test.ts
import { describe, expect, it } from 'vitest';
import { RuleViolation } from './errors.js';
import { integer, nonNegativeInt, trimmedName } from './guards.js';

describe('trimmedName', () => {
  it('trims, because the schema rejects padding rather than removing it', () => {
    expect(trimmedName('  Sable  ')).toBe('Sable');
  });

  it('preserves internal whitespace', () => {
    expect(trimmedName('Sable Nightwind')).toBe('Sable Nightwind');
  });

  it.each(['', '   ', '\t\n'])('rejects %j as empty', (value) => {
    expect(() => trimmedName(value)).toThrow(
      expect.objectContaining({ code: 'EMPTY_NAME' }) as Error,
    );
  });
});

describe('integer', () => {
  it.each([0, -3, 42])('accepts %i', (value) => {
    expect(integer(value)).toBe(value);
  });

  it.each([1.5, NaN, Infinity])('rejects %j as NOT_AN_INTEGER', (value) => {
    expect(() => integer(value)).toThrow(
      expect.objectContaining({ code: 'NOT_AN_INTEGER' }) as Error,
    );
  });
});

describe('nonNegativeInt', () => {
  it('accepts zero', () => {
    expect(nonNegativeInt(0)).toBe(0);
  });

  it('rejects a negative integer as NEGATIVE, not NOT_AN_INTEGER', () => {
    expect(() => nonNegativeInt(-1)).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
  });

  it('rejects a non-integer as NOT_AN_INTEGER, so the codes stay distinguishable', () => {
    expect(() => nonNegativeInt(1.5)).toThrow(
      expect.objectContaining({ code: 'NOT_AN_INTEGER' }) as Error,
    );
  });

  it('throws RuleViolation, not a bare Error', () => {
    expect(() => nonNegativeInt(-1)).toThrow(RuleViolation);
  });
});
```

- [ ] **Step 6: Run the tests and prove they bite**

Run: `npm test`
Expected: PASS.

Falsify: make `trimmedName` return `value` unchanged — confirm only the trim test fails. Restore. Make `nonNegativeInt` skip its `< 0` check — confirm only the NEGATIVE test fails. Restore. In `createId`, remove the `bytes[6]` version-bit line — confirm only the version/variant test and the schema-acceptance test fail. Restore.

- [ ] **Step 7: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint && npx prettier --check .
git add src/business
git commit -m "feat: add the business layer's id factory, rule errors and guards"
```

---

### Task 2: `CharacterSheetBO` — the observable root

**Files:**

- Create: `src/business/types.ts`, `src/business/characterSheet.ts`
- Test: `src/business/characterSheet.test.ts`
- Modify: `package.json` (add `mobx`)

**Interfaces:**

- Consumes: `trimmedName`, `nonNegativeInt` from Task 1; `CharacterDocument`, `createCharacter` from `src/data/schema/index.js`
- Produces: `class CharacterSheetBO` with `constructor(doc: CharacterDocument)`, `readonly id: string`, `get name()`, `setName(v)`, `get level()`, `get armorClass()`, `setArmorClass(n)`, `toDocument(): CharacterDocument`, and a protected accessor later tasks use to reach the document. `src/business/types.ts` exports the internal `*Data` aliases.

- [ ] **Step 1: Install MobX**

```bash
npm install mobx
```

Record the installed version in your report. Verify `observable` and `toJS` exist on it and behave as this task assumes — do not rely on recollection of MobX 4 or 5 behaviour.

- [ ] **Step 2: Write the failing tests**

```ts
// src/business/characterSheet.test.ts
import { describe, expect, it } from 'vitest';
import { autorun, isObservable } from 'mobx';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const FIXED_NOW = new Date('2026-07-25T09:41:00.000Z');
const ID = '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e';

const sheetFor = (name = 'Sable Nightwind') =>
  new CharacterSheetBO(createCharacter({ name, id: ID, now: FIXED_NOW }));

describe('CharacterSheetBO', () => {
  it('exposes the document id', () => {
    expect(sheetFor().id).toBe(ID);
  });

  it('reads and writes the name', () => {
    const sheet = sheetFor();
    sheet.setName('Wren Duskwhisper');
    expect(sheet.name).toBe('Wren Duskwhisper');
  });

  it('trims a name at the write boundary, because the schema rejects padding', () => {
    const sheet = sheetFor();
    sheet.setName('  Wren  ');
    expect(sheet.name).toBe('Wren');
  });

  it('rejects a name that is empty once trimmed', () => {
    const sheet = sheetFor();
    expect(() => sheet.setName('   ')).toThrow(
      expect.objectContaining({ code: 'EMPTY_NAME' }) as Error,
    );
  });

  it('rejects a negative armour class', () => {
    const sheet = sheetFor();
    expect(() => sheet.setArmorClass(-1)).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
  });

  it('makes the document observable, so a reader re-runs when a field changes', () => {
    const sheet = sheetFor();
    const seen: string[] = [];
    const stop = autorun(() => seen.push(sheet.name));

    sheet.setName('Wren');

    expect(seen).toEqual(['Sable Nightwind', 'Wren']);
    stop();
  });

  it('returns a plain object from toDocument, not an observable proxy', () => {
    const doc = sheetFor().toDocument();
    expect(isObservable(doc)).toBe(false);
  });

  it('toDocument reflects writes, so what is saved is what was edited', () => {
    const sheet = sheetFor();
    sheet.setName('Wren');
    sheet.setArmorClass(15);

    expect(sheet.toDocument()).toMatchObject({ name: 'Wren', armorClass: 15 });
  });

  it('keeps the document unreachable from outside, even from plain JavaScript', () => {
    const sheet = sheetFor();
    // A `#` field is enforced by the runtime; a TypeScript `private` would be erased and a cast
    // or plain JS would walk straight through it. This is the whole point of the layer.
    expect(Object.keys(sheet)).not.toContain('doc');
    expect(JSON.stringify(sheet)).not.toContain('schemaVersion');
  });

  it('derives level from the classes, and never stores it', () => {
    const sheet = sheetFor();
    expect(sheet.level).toBe(0);
    expect(sheet.toDocument()).not.toHaveProperty('level');
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run src/business/characterSheet.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 4: Write the internal `*Data` aliases**

```ts
// src/business/types.ts
import type { CharacterDocument } from '../data/schema/index.js';

/**
 * The stored shapes, named for the layer they belong to. Never exported from
 * `src/business/index.ts`: the UI deals in business objects only, and a `*Data` type reaching
 * it would put the document's shape back into UI signatures.
 *
 * Derived from `CharacterDocument` rather than restated, so a schema change surfaces here as a
 * type error instead of a silent divergence.
 */
export type CharacterData = CharacterDocument;
export type ClassData = CharacterDocument['classes'][number];
export type HitPointsData = CharacterDocument['hitPoints'];
export type HitDieData = CharacterDocument['hitDices'][string];
export type JournalAndNotesData = CharacterDocument['journalAndNotes'];
export type CoinsData = CharacterDocument['inventory']['coins'];
export type InventoryItemData = CharacterDocument['inventory']['items'][number];
export type EquipmentItemData = CharacterDocument['equipment']['weapons'][number];
export type FeatData = CharacterDocument['featsAndTraits']['uncategorized'][number];
export type SpellData = CharacterDocument['spellList']['uncategorized'][number];
export type CounterData = CharacterDocument['counters']['uncategorized'][number];
export type SpellSlotData = CharacterDocument['counters']['spellSlots']['1'];
export type AbilityData = CharacterDocument['abilitiesAndSkills']['abilities']['strength'];
export type SkillData = CharacterDocument['abilitiesAndSkills']['skills']['stealth'];
```

- [ ] **Step 5: Implement `CharacterSheetBO`**

```ts
// src/business/characterSheet.ts
import { observable, toJS } from 'mobx';
import type { CharacterDocument } from '../data/schema/index.js';
import { nonNegativeInt, trimmedName } from './guards.js';
import type { CharacterData } from './types.js';

export class CharacterSheetBO {
  /**
   * `#` rather than TypeScript's `private`: `private` is erased at compile time, so a cast or
   * plain JavaScript would reach the document anyway. Runtime enforcement is the point.
   *
   * Wrapped once, here. Every other business object reads through this one observable and
   * carries no MobX annotation of its own.
   */
  readonly #doc: CharacterData;

  constructor(doc: CharacterDocument) {
    this.#doc = observable(doc);
  }

  /**
   * How the rest of the tree reaches the document. Not public: `index.ts` does not export it,
   * and the UI never sees it.
   */
  get data(): CharacterData {
    return this.#doc;
  }

  get id(): string {
    return this.#doc.id;
  }

  get name(): string {
    return this.#doc.name;
  }

  setName(value: string): void {
    this.#doc.name = trimmedName(value);
  }

  /** Derived: the sum of class levels. Never stored — see spec §2.6. */
  get level(): number {
    return this.#doc.classes.reduce((total, entry) => total + entry.level, 0);
  }

  get armorClass(): number {
    return this.#doc.armorClass;
  }

  setArmorClass(value: number): void {
    this.#doc.armorClass = nonNegativeInt(value);
  }

  /** `toJS` of the observable document. This is literally the file that gets saved. */
  toDocument(): CharacterDocument {
    return toJS(this.#doc);
  }
}
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Prove the tests bite**

Change `#doc` to a TypeScript `private doc` — confirm the encapsulation test fails. Restore. Drop the `observable()` wrapper — confirm the `autorun` test fails. Restore. Make `toDocument` return `this.#doc` instead of `toJS(this.#doc)` — confirm the `isObservable` test fails. Restore. Make `setName` assign `value` without `trimmedName` — confirm only the trim and empty-name tests fail. Restore.

- [ ] **Step 8: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint && npx prettier --check .
git add package.json package-lock.json src/business
git commit -m "feat: add CharacterSheetBO, the observable root of the business layer

The document lives in a # private field so the UI cannot reach it from
plain JavaScript, and toJS of it remains literally the saved file."
```

---

### Task 3: `NodeBO` and the classes collection

The first collection, and the birthplace of the base class every item object extends.

**Files:**

- Create: `src/business/nodeBO.ts`, `src/business/classes.ts`
- Modify: `src/business/characterSheet.ts`
- Test: `src/business/classes.test.ts`

**Interfaces:**

- Consumes: `CharacterSheetBO.data`, `createId`, `trimmedName`, `nonNegativeInt`, `RuleViolation`
- Produces: `abstract class NodeBO<TData>` with `protected readonly node: TData` and `remove(): void`; `class ClassesBO` with `get items(): ClassBO[]`, `add(init: NewClass): ClassBO`; `class ClassBO extends NodeBO<ClassData>` with `get id()`, `get name()`, `setName(v)`, `get level()`, `setLevel(n)`, `remove()`; `type NewClass = { name: string; level?: number }`; `CharacterSheetBO.classes: ClassesBO`

- [ ] **Step 1: Write the failing tests**

```ts
// src/business/classes.test.ts
import { describe, expect, it } from 'vitest';
import { autorun } from 'mobx';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('ClassesBO', () => {
  it('starts empty', () => {
    expect(sheetFor().classes.items).toEqual([]);
  });

  it('adds a class and returns it', () => {
    const sheet = sheetFor();
    const rogue = sheet.classes.add({ name: 'Rogue', level: 5 });

    expect(rogue.name).toBe('Rogue');
    expect(rogue.level).toBe(5);
    expect(sheet.classes.items).toHaveLength(1);
  });

  it('mints an id for the new class', () => {
    const rogue = sheetFor().classes.add({ name: 'Rogue' });
    expect(rogue.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('defaults an omitted level to zero, the blank-document value', () => {
    expect(sheetFor().classes.add({ name: 'Rogue' }).level).toBe(0);
  });

  it('trims the name on add', () => {
    expect(sheetFor().classes.add({ name: '  Rogue  ' }).name).toBe('Rogue');
  });

  it('appends, so display order is creation order', () => {
    const sheet = sheetFor();
    sheet.classes.add({ name: 'Rogue' });
    sheet.classes.add({ name: 'Wizard' });

    expect(sheet.classes.items.map((entry) => entry.name)).toEqual(['Rogue', 'Wizard']);
  });

  // The schema permits two classes with one name so a hand-edited document is never rejected
  // over it. The business layer is where it gets refused — see spec section 2.5.
  it('rejects a duplicate name on add', () => {
    const sheet = sheetFor();
    sheet.classes.add({ name: 'Rogue' });

    expect(() => sheet.classes.add({ name: 'Rogue' })).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_NAME' }) as Error,
    );
  });

  it('compares duplicate names after trimming, so padding cannot smuggle one past', () => {
    const sheet = sheetFor();
    sheet.classes.add({ name: 'Rogue' });

    expect(() => sheet.classes.add({ name: '  Rogue  ' })).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_NAME' }) as Error,
    );
  });

  it('rejects a negative level', () => {
    expect(() => sheetFor().classes.add({ name: 'Rogue', level: -1 })).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
  });
});

describe('ClassBO', () => {
  it('renames in place, keeping its position', () => {
    const sheet = sheetFor();
    const rogue = sheet.classes.add({ name: 'Rogue' });
    sheet.classes.add({ name: 'Wizard' });

    rogue.setName('Swashbuckler');

    expect(sheet.classes.items.map((entry) => entry.name)).toEqual(['Swashbuckler', 'Wizard']);
  });

  it('rejects a rename onto another class name', () => {
    const sheet = sheetFor();
    const rogue = sheet.classes.add({ name: 'Rogue' });
    sheet.classes.add({ name: 'Wizard' });

    expect(() => rogue.setName('Wizard')).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_NAME' }) as Error,
    );
  });

  it('allows renaming a class to the name it already has', () => {
    const rogue = sheetFor().classes.add({ name: 'Rogue' });
    expect(() => rogue.setName('Rogue')).not.toThrow();
  });

  it('removes itself from the collection', () => {
    const sheet = sheetFor();
    const rogue = sheet.classes.add({ name: 'Rogue' });
    sheet.classes.add({ name: 'Wizard' });

    rogue.remove();

    expect(sheet.classes.items.map((entry) => entry.name)).toEqual(['Wizard']);
  });

  it('throws GONE when removed twice, rather than silently doing nothing', () => {
    const rogue = sheetFor().classes.add({ name: 'Rogue' });
    rogue.remove();

    expect(() => rogue.remove()).toThrow(expect.objectContaining({ code: 'GONE' }) as Error);
  });

  it('feeds the sheet-level derived total', () => {
    const sheet = sheetFor();
    sheet.classes.add({ name: 'Rogue', level: 5 });
    sheet.classes.add({ name: 'Wizard', level: 2 });

    expect(sheet.level).toBe(7);
  });

  it('is observable, so a level change re-runs a reader of the derived total', () => {
    const sheet = sheetFor();
    const rogue = sheet.classes.add({ name: 'Rogue', level: 1 });
    const seen: number[] = [];
    const stop = autorun(() => seen.push(sheet.level));

    rogue.setLevel(3);

    expect(seen).toEqual([1, 3]);
    stop();
  });

  it('writes through to the saved document', () => {
    const sheet = sheetFor();
    sheet.classes.add({ name: 'Rogue', level: 5 });

    expect(sheet.toDocument().classes).toMatchObject([{ name: 'Rogue', level: 5 }]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/business/classes.test.ts`
Expected: FAIL — `sheet.classes` does not exist.

- [ ] **Step 3: Write the base class**

```ts
// src/business/nodeBO.ts
import { RuleViolation } from './errors.js';

/**
 * A business object over one node of the document.
 *
 * It holds the node directly. An earlier draft resolved by id on every access so an object
 * could survive the document being swapped underneath it; that was over-built, because nothing
 * swaps a document in place — the raw-JSON editor disposes its sheet and re-opens. What
 * survives is `GONE`, raised when an object is removed twice: removing something that is
 * already gone is a bug worth hearing about, not a no-op.
 *
 * It holds a reference, never a copy of a value. Cache a name or mirror a list once and memory
 * and file can disagree, which is the class of bug this codebase is built to avoid.
 */
export abstract class NodeBO<TData extends object> {
  /**
   * `protected`, not `#`. The runtime-privacy requirement applies to the document on
   * `CharacterSheetBO` — that is what the UI must not reach. Subclasses legitimately need both
   * their node and their sibling array: a duplicate-name check reads the siblings, and so does
   * `remove()`.
   */
  /**
   * `siblings` is NOT readonly: `CategorizedItemBO.moveTo` repoints it when an item changes
   * bucket. Leaving it readonly would keep a moved item pointing at the array it came from, so
   * a later `remove()` would search the wrong list and throw GONE for an item that is plainly
   * still there.
   */
  constructor(
    protected readonly node: TData,
    protected siblings: TData[],
  ) {}

  remove(): void {
    const index = this.siblings.indexOf(this.node);
    if (index === -1) {
      throw new RuleViolation('GONE', 'this item is no longer in the document');
    }
    this.siblings.splice(index, 1);
  }
}
```

The constructor is public rather than protected so collections can instantiate their items directly. Every concrete item class below inherits it unchanged unless it needs extra arguments.

- [ ] **Step 4: Implement the classes collection**

```ts
// src/business/classes.ts
import { createId } from './createId.js';
import { RuleViolation } from './errors.js';
import { nonNegativeInt, trimmedName } from './guards.js';
import { NodeBO } from './nodeBO.js';
import type { ClassData } from './types.js';

export interface NewClass {
  name: string;
  level?: number;
}

export class ClassesBO {
  readonly #classes: ClassData[];

  constructor(classes: ClassData[]) {
    this.#classes = classes;
  }

  get items(): ClassBO[] {
    return this.#classes.map((node) => new ClassBO(node, this.#classes));
  }

  add({ name, level = 0 }: NewClass): ClassBO {
    const trimmed = trimmedName(name);
    rejectDuplicate(this.#classes, trimmed, null);

    const node: ClassData = { id: createId(), name: trimmed, level: nonNegativeInt(level) };
    this.#classes.push(node);
    return new ClassBO(node, this.#classes);
  }
}

export class ClassBO extends NodeBO<ClassData> {
  get id(): string {
    return this.node.id;
  }

  get name(): string {
    return this.node.name;
  }

  setName(value: string): void {
    const trimmed = trimmedName(value);
    rejectDuplicate(this.siblings, trimmed, this.node);
    this.node.name = trimmed;
  }

  get level(): number {
    return this.node.level;
  }

  setLevel(value: number): void {
    this.node.level = nonNegativeInt(value);
  }
}

/** `except` is the node being renamed, so renaming a class to its own name is not a duplicate. */
function rejectDuplicate(classes: readonly ClassData[], name: string, except: ClassData | null) {
  if (classes.some((entry) => entry !== except && entry.name === name)) {
    throw new RuleViolation('DUPLICATE_NAME', `a class named "${name}" already exists`);
  }
}
```

Note how `setName` reads `this.siblings` — the same array `remove()` splices. That is why `NodeBO` exposes it to subclasses as `protected` rather than `#`: the runtime-privacy requirement applies to the **document on `CharacterSheetBO`**, which is what the UI must not reach, not to every intermediate field.

- [ ] **Step 5: Attach it to the sheet**

In `src/business/characterSheet.ts`:

```ts
import { ClassesBO } from './classes.js';
```

```ts
  readonly classes: ClassesBO;

  constructor(doc: CharacterDocument) {
    this.#doc = observable(doc);
    this.classes = new ClassesBO(this.#doc.classes);
  }
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Prove the tests bite**

Remove the `rejectDuplicate` call in `add` — confirm only the two duplicate-on-add tests fail. Restore. Remove the `except` parameter's effect (always compare every entry) — confirm only "allows renaming a class to the name it already has" fails. Restore. Make `remove()` return early instead of throwing when `index === -1` — confirm only the GONE test fails. Restore. Replace `push` with `unshift` — confirm only the ordering test fails. Restore.

- [ ] **Step 8: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint && npx prettier --check .
git add src/business
git commit -m "feat: add NodeBO and the classes collection

Duplicate class names are refused here rather than by the schema, so a
hand-edited document is never rejected over one."
```

---

### Task 4: Hit points and hit dice

**Files:**

- Create: `src/business/hitPoints.ts`, `src/business/hitDices.ts`
- Modify: `src/business/characterSheet.ts`
- Test: `src/business/hitPoints.test.ts`, `src/business/hitDices.test.ts`

**Interfaces:**

- Produces: `class HitPointsBO` with `get current()`, `setCurrent(n)`, `get total()`, `setTotal(n)`, `get temporary()`, `setTemporary(n)`; `class HitDicesBO` with `get items(): HitDieBO[]`, `add(size: number): HitDieBO`; `class HitDieBO` with `get size(): number`, `get current()`, `setCurrent(n)`, `get total()`, `setTotal(n)`, `remove()`; `CharacterSheetBO.hitPoints`, `CharacterSheetBO.hitDices`

- [ ] **Step 1: Write the failing tests**

```ts
// src/business/hitPoints.test.ts
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('HitPointsBO', () => {
  it('starts at zero across all three fields', () => {
    const { hitPoints } = sheetFor();
    expect([hitPoints.current, hitPoints.total, hitPoints.temporary]).toEqual([0, 0, 0]);
  });

  it.each([
    ['setCurrent', 'current'],
    ['setTotal', 'total'],
    ['setTemporary', 'temporary'],
  ] as const)('%s writes %s', (setter, getter) => {
    const { hitPoints } = sheetFor();
    hitPoints[setter](7);
    expect(hitPoints[getter]).toBe(7);
  });

  it.each(['setCurrent', 'setTotal', 'setTemporary'] as const)('%s rejects a negative', (setter) => {
    const { hitPoints } = sheetFor();
    expect(() => hitPoints[setter](-1)).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
  });

  // Deliberate: a player may knowingly set current above total (spec section 3.2). The schema
  // does not check it and neither does this layer.
  it('allows current to exceed total, because the rules sometimes do', () => {
    const { hitPoints } = sheetFor();
    hitPoints.setTotal(10);
    hitPoints.setCurrent(14);
    expect(hitPoints.current).toBe(14);
  });

  it('writes through to the saved document', () => {
    const sheet = sheetFor();
    sheet.hitPoints.setTotal(45);
    expect(sheet.toDocument().hitPoints).toMatchObject({ total: 45 });
  });
});
```

```ts
// src/business/hitDices.test.ts
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('HitDicesBO', () => {
  it('starts empty', () => {
    expect(sheetFor().hitDices.items).toEqual([]);
  });

  it('adds a die by size, starting at zero', () => {
    const die = sheetFor().hitDices.add(8);
    expect([die.size, die.current, die.total]).toEqual([8, 0, 0]);
  });

  it('rejects a size already present, because the size is the identity', () => {
    const sheet = sheetFor();
    sheet.hitDices.add(8);
    expect(() => sheet.hitDices.add(8)).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_DIE' }) as Error,
    );
  });

  it.each([0, -6, 1.5])('rejects %j as a die size', (size) => {
    expect(() => sheetFor().hitDices.add(size)).toThrow(Error);
  });

  // The key is the die size and numeric-like string keys iterate in ascending numeric order,
  // which is exactly the display order a player expects: d4, d6, d8, d12, d20.
  it('lists dice in ascending size regardless of the order they were added', () => {
    const sheet = sheetFor();
    sheet.hitDices.add(12);
    sheet.hitDices.add(6);
    sheet.hitDices.add(20);

    expect(sheet.hitDices.items.map((die) => die.size)).toEqual([6, 12, 20]);
  });

  it('removes a die, deleting its key entirely', () => {
    const sheet = sheetFor();
    const die = sheet.hitDices.add(8);
    die.remove();

    expect(sheet.hitDices.items).toEqual([]);
    expect(sheet.toDocument().hitDices).toEqual({});
  });

  it('throws GONE when a die is removed twice', () => {
    const die = sheetFor().hitDices.add(8);
    die.remove();
    expect(() => die.remove()).toThrow(expect.objectContaining({ code: 'GONE' }) as Error);
  });

  it('writes current and total through to the saved document', () => {
    const sheet = sheetFor();
    const die = sheet.hitDices.add(8);
    die.setCurrent(3);
    die.setTotal(5);

    expect(sheet.toDocument().hitDices).toEqual({ '8': { current: 3, total: 5 } });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/business/hitPoints.test.ts src/business/hitDices.test.ts`
Expected: FAIL — neither accessor exists.

- [ ] **Step 3: Implement both**

```ts
// src/business/hitPoints.ts
import { nonNegativeInt } from './guards.js';
import type { HitPointsData } from './types.js';

export class HitPointsBO {
  readonly #node: HitPointsData;

  constructor(node: HitPointsData) {
    this.#node = node;
  }

  get current(): number {
    return this.#node.current;
  }

  /** Not checked against `total`: a player may knowingly set it higher (spec section 3.2). */
  setCurrent(value: number): void {
    this.#node.current = nonNegativeInt(value);
  }

  get total(): number {
    return this.#node.total;
  }

  setTotal(value: number): void {
    this.#node.total = nonNegativeInt(value);
  }

  get temporary(): number {
    return this.#node.temporary;
  }

  setTemporary(value: number): void {
    this.#node.temporary = nonNegativeInt(value);
  }
}
```

```ts
// src/business/hitDices.ts
import { RuleViolation } from './errors.js';
import { nonNegativeInt } from './guards.js';
import type { CharacterData, HitDieData } from './types.js';

type HitDices = CharacterData['hitDices'];

export class HitDicesBO {
  readonly #dice: HitDices;

  constructor(dice: HitDices) {
    this.#dice = dice;
  }

  /**
   * Ascending by size. The stored keys are numeric-like strings, which iterate in ascending
   * numeric order, but sorting explicitly says so rather than relying on that.
   */
  get items(): HitDieBO[] {
    return Object.keys(this.#dice)
      .map(Number)
      .sort((a, b) => a - b)
      .map((size) => new HitDieBO(this.#dice, size));
  }

  add(size: number): HitDieBO {
    if (nonNegativeInt(size) === 0) {
      throw new RuleViolation('NOT_AN_INTEGER', 'a die size must be at least 1');
    }

    const key = String(size);
    if (key in this.#dice) {
      throw new RuleViolation('DUPLICATE_DIE', `a d${key} is already present`);
    }

    this.#dice[key] = { current: 0, total: 0 };
    return new HitDieBO(this.#dice, size);
  }
}

export class HitDieBO {
  readonly #dice: HitDices;
  readonly #key: string;

  constructor(dice: HitDices, size: number) {
    this.#dice = dice;
    this.#key = String(size);
  }

  get size(): number {
    return Number(this.#key);
  }

  get current(): number {
    return this.#node.current;
  }

  setCurrent(value: number): void {
    this.#node.current = nonNegativeInt(value);
  }

  get total(): number {
    return this.#node.total;
  }

  setTotal(value: number): void {
    this.#node.total = nonNegativeInt(value);
  }

  remove(): void {
    this.#require();
    delete this.#dice[this.#key];
  }

  /**
   * Keyed by die size rather than held by reference, because `hitDices` is a record and a die's
   * identity IS its key. `NodeBO` does not fit: there is no sibling array to splice.
   */
  get #node(): HitDieData {
    return this.#require();
  }

  #require(): HitDieData {
    const node = this.#dice[this.#key];
    if (node === undefined) {
      throw new RuleViolation('GONE', `the d${this.#key} is no longer in the document`);
    }
    return node;
  }
}
```

- [ ] **Step 4: Attach both to the sheet**

In `characterSheet.ts`, add `readonly hitPoints: HitPointsBO;` and `readonly hitDices: HitDicesBO;`, assigned in the constructor from `this.#doc.hitPoints` and `this.#doc.hitDices`.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Prove the tests bite**

Remove the `key in this.#dice` check — confirm only the duplicate-die test fails. Restore. Remove the `.sort()` — confirm the ascending-order test fails (note in your report whether it fails reliably; if insertion order happens to match, add a case that does discriminate). Make `#require` return a fresh `{current: 0, total: 0}` instead of throwing — confirm only the GONE test fails. Restore.

- [ ] **Step 7: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint && npx prettier --check .
git add src/business
git commit -m "feat: add hit points and hit dice business objects"
```

---

### Task 5: Journal and notes

The append-only rule from `Model.ts`, enforced.

**Files:**

- Create: `src/business/journalAndNotes.ts`
- Modify: `src/business/characterSheet.ts`
- Test: `src/business/journalAndNotes.test.ts`

**Interfaces:**

- Produces: `class JournalAndNotesBO` with `get notes()`, `setNotes(v)`, `get days(): JournalDayBO[]`, `appendDay(text?: string): JournalDayBO`, `deleteNewestDay(): void`; `class JournalDayBO` with `get dayIndex(): number`, `get text()`, `setText(v)`; `CharacterSheetBO.journalAndNotes`

- [ ] **Step 1: Write the failing tests**

```ts
// src/business/journalAndNotes.test.ts
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('JournalAndNotesBO', () => {
  it('starts with no days and empty notes', () => {
    const { journalAndNotes } = sheetFor();
    expect(journalAndNotes.days).toEqual([]);
    expect(journalAndNotes.notes).toBe('');
  });

  it('reads and writes notes', () => {
    const { journalAndNotes } = sheetFor();
    journalAndNotes.setNotes('Find the Sunsword.');
    expect(journalAndNotes.notes).toBe('Find the Sunsword.');
  });

  // Freeform prose, unlike a name: leading whitespace may be deliberate, and the schema's
  // longText does not reject padding.
  it('does not trim notes, because leading whitespace may be deliberate', () => {
    const { journalAndNotes } = sheetFor();
    journalAndNotes.setNotes('  indented  ');
    expect(journalAndNotes.notes).toBe('  indented  ');
  });

  it('appends a day at the end only', () => {
    const { journalAndNotes } = sheetFor();
    journalAndNotes.appendDay('Arrived in Barovia.');
    journalAndNotes.appendDay('Met the burgomaster.');

    expect(journalAndNotes.days.map((day) => day.text)).toEqual([
      'Arrived in Barovia.',
      'Met the burgomaster.',
    ]);
  });

  it('numbers days by position, because the index IS the day index', () => {
    const { journalAndNotes } = sheetFor();
    journalAndNotes.appendDay();
    const second = journalAndNotes.appendDay();

    expect(second.dayIndex).toBe(1);
  });

  it('appends an empty day when no text is given', () => {
    expect(sheetFor().journalAndNotes.appendDay().text).toBe('');
  });

  it('edits a day in place', () => {
    const { journalAndNotes } = sheetFor();
    const day = journalAndNotes.appendDay('Arrived.');
    day.setText('Arrived in Barovia.');

    expect(journalAndNotes.days[0]?.text).toBe('Arrived in Barovia.');
  });

  it('deletes the newest day only', () => {
    const { journalAndNotes } = sheetFor();
    journalAndNotes.appendDay('one');
    journalAndNotes.appendDay('two');

    journalAndNotes.deleteNewestDay();

    expect(journalAndNotes.days.map((day) => day.text)).toEqual(['one']);
  });

  it('throws GONE when deleting from an empty journal', () => {
    expect(() => sheetFor().journalAndNotes.deleteNewestDay()).toThrow(
      expect.objectContaining({ code: 'GONE' }) as Error,
    );
  });

  // There is deliberately no way to delete or insert at an arbitrary index. Model.ts states the
  // rule: the business layer may only append at the end and delete the newest.
  it('exposes no way to remove a day other than the newest', () => {
    const { journalAndNotes } = sheetFor();
    journalAndNotes.appendDay('one');
    const day = journalAndNotes.days[0];

    expect(day).toBeDefined();
    expect(day).not.toHaveProperty('remove');
  });

  it('writes through to the saved document', () => {
    const sheet = sheetFor();
    sheet.journalAndNotes.appendDay('one');
    sheet.journalAndNotes.setNotes('notes');

    expect(sheet.toDocument().journalAndNotes).toEqual({ journal: ['one'], notes: 'notes' });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/business/journalAndNotes.test.ts`
Expected: FAIL — accessor does not exist.

- [ ] **Step 3: Implement it**

```ts
// src/business/journalAndNotes.ts
import { RuleViolation } from './errors.js';
import type { JournalAndNotesData } from './types.js';

export class JournalAndNotesBO {
  readonly #node: JournalAndNotesData;

  constructor(node: JournalAndNotesData) {
    this.#node = node;
  }

  get notes(): string {
    return this.#node.notes;
  }

  /** Not trimmed: freeform prose, where leading whitespace may be deliberate. */
  setNotes(value: string): void {
    this.#node.notes = value;
  }

  get days(): JournalDayBO[] {
    return this.#node.journal.map((_, index) => new JournalDayBO(this.#node.journal, index));
  }

  /**
   * Appends at the end only, per `Model.ts`: the array index IS the day index, so inserting
   * anywhere else would renumber every day after it.
   */
  appendDay(text = ''): JournalDayBO {
    this.#node.journal.push(text);
    return new JournalDayBO(this.#node.journal, this.#node.journal.length - 1);
  }

  /** The newest day only. No other index is deletable, for the same reason. */
  deleteNewestDay(): void {
    if (this.#node.journal.length === 0) {
      throw new RuleViolation('GONE', 'there is no journal day to delete');
    }
    this.#node.journal.pop();
  }
}

export class JournalDayBO {
  readonly #journal: string[];
  readonly #index: number;

  constructor(journal: string[], index: number) {
    this.#journal = journal;
    this.#index = index;
  }

  get dayIndex(): number {
    return this.#index;
  }

  get text(): string {
    return this.#require();
  }

  setText(value: string): void {
    this.#require();
    this.#journal[this.#index] = value;
  }

  #require(): string {
    const text = this.#journal[this.#index];
    if (text === undefined) {
      throw new RuleViolation('GONE', `journal day ${this.#index} is no longer in the document`);
    }
    return text;
  }
}
```

- [ ] **Step 4: Attach it to the sheet**

Add `readonly journalAndNotes: JournalAndNotesBO;`, assigned from `this.#doc.journalAndNotes`.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Prove the tests bite**

Change `push` to `unshift` in `appendDay` — confirm the append-order and dayIndex tests fail. Restore. Change `pop` to `shift` in `deleteNewestDay` — confirm the delete-newest test fails. Restore. Make `deleteNewestDay` return early on an empty journal instead of throwing — confirm only the empty-journal test fails. Restore.

- [ ] **Step 7: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint && npx prettier --check .
git add src/business
git commit -m "feat: add the journal and notes business object

Appends at the end and deletes only the newest, per Model.ts: the array
index is the day index, so any other mutation renumbers days."
```

---

### Task 6: `NamedItemBO`, inventory and coins

The base class for the five name-and-description item types, born with its first subclass.

**Files:**

- Create: `src/business/namedItem.ts`, `src/business/inventory.ts`
- Modify: `src/business/characterSheet.ts`
- Test: `src/business/inventory.test.ts`

**Interfaces:**

- Produces: `abstract class NamedItemBO<TData extends { id: string; name: string; description: string }> extends NodeBO<TData>` with `get id()`, `get name()`, `setName(v)`, `get description()`, `setDescription(v)`; `class InventoryBO` with `readonly coins: CoinsBO`, `get items(): InventoryItemBO[]`, `add(init: NewInventoryItem): InventoryItemBO`; `class CoinsBO` with `setPp/setGp/setEp/setSp/setCp` and matching getters; `class InventoryItemBO extends NamedItemBO<InventoryItemData>` with `get count()`, `setCount(n)`; `type NewInventoryItem = { name: string; description?: string; count?: number }`; `CharacterSheetBO.inventory`

- [ ] **Step 1: Write the failing tests**

```ts
// src/business/inventory.test.ts
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('CoinsBO', () => {
  it('starts at zero for every denomination', () => {
    const { coins } = sheetFor().inventory;
    expect([coins.pp, coins.gp, coins.ep, coins.sp, coins.cp]).toEqual([0, 0, 0, 0, 0]);
  });

  it.each([
    ['setPp', 'pp'],
    ['setGp', 'gp'],
    ['setEp', 'ep'],
    ['setSp', 'sp'],
    ['setCp', 'cp'],
  ] as const)('%s writes %s', (setter, getter) => {
    const { coins } = sheetFor().inventory;
    coins[setter](5);
    expect(coins[getter]).toBe(5);
  });

  it.each(['setPp', 'setGp', 'setEp', 'setSp', 'setCp'] as const)(
    '%s rejects a negative amount',
    (setter) => {
      const { coins } = sheetFor().inventory;
      expect(() => coins[setter](-1)).toThrow(
        expect.objectContaining({ code: 'NEGATIVE' }) as Error,
      );
    },
  );
});

describe('InventoryBO', () => {
  it('starts with no items', () => {
    expect(sheetFor().inventory.items).toEqual([]);
  });

  it('adds an item with its defaults', () => {
    const item = sheetFor().inventory.add({ name: "Thieves' Tools" });
    expect([item.name, item.description, item.count]).toEqual(["Thieves' Tools", '', 0]);
  });

  it('mints an id for the new item', () => {
    expect(sheetFor().inventory.add({ name: 'Rope' }).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('trims the name but not the description', () => {
    const item = sheetFor().inventory.add({ name: '  Rope  ', description: '  50 feet  ' });
    expect(item.name).toBe('Rope');
    expect(item.description).toBe('  50 feet  ');
  });

  // Unlike classes and categories, items may repeat a name — two daggers are two daggers.
  it('allows two items to share a name', () => {
    const sheet = sheetFor();
    sheet.inventory.add({ name: 'Dagger' });
    expect(() => sheet.inventory.add({ name: 'Dagger' })).not.toThrow();
  });

  it('rejects a negative count', () => {
    expect(() => sheetFor().inventory.add({ name: 'Rope', count: -1 })).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
  });

  it('removes an item, leaving the rest in order', () => {
    const sheet = sheetFor();
    const rope = sheet.inventory.add({ name: 'Rope' });
    sheet.inventory.add({ name: 'Torch' });

    rope.remove();

    expect(sheet.inventory.items.map((item) => item.name)).toEqual(['Torch']);
  });

  it('throws GONE when an item is removed twice', () => {
    const rope = sheetFor().inventory.add({ name: 'Rope' });
    rope.remove();
    expect(() => rope.remove()).toThrow(expect.objectContaining({ code: 'GONE' }) as Error);
  });

  it('writes through to the saved document', () => {
    const sheet = sheetFor();
    sheet.inventory.add({ name: 'Rope', count: 1 });
    sheet.inventory.coins.setGp(84);

    const { inventory } = sheet.toDocument();
    expect(inventory.coins.gp).toBe(84);
    expect(inventory.items).toMatchObject([{ name: 'Rope', count: 1 }]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/business/inventory.test.ts`
Expected: FAIL — accessor does not exist.

- [ ] **Step 3: Write `NamedItemBO`**

```ts
// src/business/namedItem.ts
import { trimmedName } from './guards.js';
import { NodeBO } from './nodeBO.js';

export interface NamedItemData {
  id: string;
  name: string;
  description: string;
}

/**
 * The shared shape of the five item types that carry a name and a description: inventory items,
 * equipment, spells, counters, and feats. Five subclasses, so the abstraction is reuse rather
 * than speculation.
 */
export abstract class NamedItemBO<TData extends NamedItemData> extends NodeBO<TData> {
  get id(): string {
    return this.node.id;
  }

  get name(): string {
    return this.node.name;
  }

  setName(value: string): void {
    this.node.name = trimmedName(value);
  }

  get description(): string {
    return this.node.description;
  }

  /** Not trimmed: freeform prose, where leading whitespace may be deliberate. */
  setDescription(value: string): void {
    this.node.description = value;
  }
}
```

- [ ] **Step 4: Implement inventory and coins**

```ts
// src/business/inventory.ts
import { createId } from './createId.js';
import { nonNegativeInt, trimmedName } from './guards.js';
import { NamedItemBO } from './namedItem.js';
import type { CoinsData, InventoryItemData } from './types.js';

export interface NewInventoryItem {
  name: string;
  description?: string;
  count?: number;
}

export class InventoryBO {
  readonly coins: CoinsBO;
  readonly #items: InventoryItemData[];

  constructor(coins: CoinsData, items: InventoryItemData[]) {
    this.coins = new CoinsBO(coins);
    this.#items = items;
  }

  get items(): InventoryItemBO[] {
    return this.#items.map((node) => new InventoryItemBO(node, this.#items));
  }

  add({ name, description = '', count = 0 }: NewInventoryItem): InventoryItemBO {
    const node: InventoryItemData = {
      id: createId(),
      name: trimmedName(name),
      description,
      count: nonNegativeInt(count),
    };
    this.#items.push(node);
    return new InventoryItemBO(node, this.#items);
  }
}

/** Five fixed denominations; the keys are the identity, so there are no ids and no add/remove. */
export class CoinsBO {
  readonly #node: CoinsData;

  constructor(node: CoinsData) {
    this.#node = node;
  }

  get pp(): number {
    return this.#node.pp;
  }

  setPp(value: number): void {
    this.#node.pp = nonNegativeInt(value);
  }

  get gp(): number {
    return this.#node.gp;
  }

  setGp(value: number): void {
    this.#node.gp = nonNegativeInt(value);
  }

  get ep(): number {
    return this.#node.ep;
  }

  setEp(value: number): void {
    this.#node.ep = nonNegativeInt(value);
  }

  get sp(): number {
    return this.#node.sp;
  }

  setSp(value: number): void {
    this.#node.sp = nonNegativeInt(value);
  }

  get cp(): number {
    return this.#node.cp;
  }

  setCp(value: number): void {
    this.#node.cp = nonNegativeInt(value);
  }
}

export class InventoryItemBO extends NamedItemBO<InventoryItemData> {
  get count(): number {
    return this.node.count;
  }

  setCount(value: number): void {
    this.node.count = nonNegativeInt(value);
  }
}
```

- [ ] **Step 5: Attach it to the sheet**

Add `readonly inventory: InventoryBO;`, assigned from `this.#doc.inventory.coins` and `this.#doc.inventory.items`.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Prove the tests bite**

Make `setDescription` call `trimmedName` — confirm only the trim-name-not-description test fails. Restore. Make `add` reuse a fixed id string instead of `createId()` — confirm the id test still passes but note in your report that it does, and add an assertion that two added items have different ids. Restore.

- [ ] **Step 8: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint && npx prettier --check .
git add src/business
git commit -m "feat: add NamedItemBO, inventory and coins"
```

---

### Task 7: Equipment, with its derived views

**Files:**

- Create: `src/business/equipment.ts`
- Modify: `src/business/characterSheet.ts`
- Test: `src/business/equipment.test.ts`

**Interfaces:**

- Produces: `class EquipmentBO` with `get weapons(): EquipmentItemBO[]`, `get other(): EquipmentItemBO[]`, `addWeapon(init)`, `addOther(init)`, `get attuned(): EquipmentItemBO[]`, `get equipped(): EquipmentItemBO[]`; `class EquipmentItemBO extends NamedItemBO<EquipmentItemData>` with `get attuned()`, `setAttuned(b)`, `get equipped()`, `setEquipped(b)`; `type NewEquipmentItem = { name: string; description?: string; attuned?: boolean; equipped?: boolean }`; `CharacterSheetBO.equipment`

- [ ] **Step 1: Write the failing tests**

```ts
// src/business/equipment.test.ts
import { describe, expect, it } from 'vitest';
import { autorun } from 'mobx';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('EquipmentBO', () => {
  it('starts with both lists empty', () => {
    const { equipment } = sheetFor();
    expect([equipment.weapons, equipment.other]).toEqual([[], []]);
  });

  it('adds to weapons and to other independently', () => {
    const sheet = sheetFor();
    sheet.equipment.addWeapon({ name: 'Rapier' });
    sheet.equipment.addOther({ name: 'Cloak of Elvenkind' });

    expect(sheet.equipment.weapons.map((item) => item.name)).toEqual(['Rapier']);
    expect(sheet.equipment.other.map((item) => item.name)).toEqual(['Cloak of Elvenkind']);
  });

  it('defaults both flags to false', () => {
    const item = sheetFor().equipment.addWeapon({ name: 'Rapier' });
    expect([item.attuned, item.equipped]).toEqual([false, false]);
  });

  // Derived views over both lists. Never stored — spec section 2.6 keeps them off the document.
  it('derives attuned across weapons and other', () => {
    const sheet = sheetFor();
    sheet.equipment.addWeapon({ name: 'Rapier', attuned: true });
    sheet.equipment.addOther({ name: 'Cloak', attuned: true });
    sheet.equipment.addOther({ name: 'Rations' });

    expect(sheet.equipment.attuned.map((item) => item.name)).toEqual(['Rapier', 'Cloak']);
  });

  it('derives equipped across weapons and other', () => {
    const sheet = sheetFor();
    sheet.equipment.addWeapon({ name: 'Rapier', equipped: true });
    sheet.equipment.addOther({ name: 'Cloak' });

    expect(sheet.equipment.equipped.map((item) => item.name)).toEqual(['Rapier']);
  });

  it('updates the derived view when a flag is toggled', () => {
    const sheet = sheetFor();
    const rapier = sheet.equipment.addWeapon({ name: 'Rapier' });
    const seen: number[] = [];
    const stop = autorun(() => seen.push(sheet.equipment.equipped.length));

    rapier.setEquipped(true);

    expect(seen).toEqual([0, 1]);
    stop();
  });

  // The app does not cap attunement at three or check whether armour can be worn. It computes
  // nothing — that is the point.
  it('does not cap attunement, because the app enforces no rules', () => {
    const sheet = sheetFor();
    for (const name of ['A', 'B', 'C', 'D']) {
      sheet.equipment.addOther({ name, attuned: true });
    }
    expect(sheet.equipment.attuned).toHaveLength(4);
  });

  it('keeps the derived views out of the saved document', () => {
    const sheet = sheetFor();
    sheet.equipment.addWeapon({ name: 'Rapier', attuned: true });

    const { equipment } = sheet.toDocument();
    expect(equipment).not.toHaveProperty('attuned');
    expect(equipment).not.toHaveProperty('equipped');
    expect(Object.keys(equipment)).toEqual(['weapons', 'other']);
  });

  it('removes a weapon without touching the other list', () => {
    const sheet = sheetFor();
    const rapier = sheet.equipment.addWeapon({ name: 'Rapier' });
    sheet.equipment.addOther({ name: 'Cloak' });

    rapier.remove();

    expect(sheet.equipment.weapons).toEqual([]);
    expect(sheet.equipment.other).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/business/equipment.test.ts`
Expected: FAIL — accessor does not exist.

- [ ] **Step 3: Implement it**

```ts
// src/business/equipment.ts
import { createId } from './createId.js';
import { trimmedName } from './guards.js';
import { NamedItemBO } from './namedItem.js';
import type { EquipmentItemData } from './types.js';

export interface NewEquipmentItem {
  name: string;
  description?: string;
  attuned?: boolean;
  equipped?: boolean;
}

export class EquipmentBO {
  readonly #weapons: EquipmentItemData[];
  readonly #other: EquipmentItemData[];

  constructor(weapons: EquipmentItemData[], other: EquipmentItemData[]) {
    this.#weapons = weapons;
    this.#other = other;
  }

  get weapons(): EquipmentItemBO[] {
    return this.#weapons.map((node) => new EquipmentItemBO(node, this.#weapons));
  }

  get other(): EquipmentItemBO[] {
    return this.#other.map((node) => new EquipmentItemBO(node, this.#other));
  }

  addWeapon(init: NewEquipmentItem): EquipmentItemBO {
    return addTo(this.#weapons, init);
  }

  addOther(init: NewEquipmentItem): EquipmentItemBO {
    return addTo(this.#other, init);
  }

  /**
   * Derived views over both lists, never stored (spec section 2.6). `attuned` and `equipped` are
   * treated identically throughout: a boolean on the item, a derived list, and a toggle each.
   * Neither carries a rule — the app does not cap attunement or check what can be worn.
   */
  get attuned(): EquipmentItemBO[] {
    return [...this.weapons, ...this.other].filter((item) => item.attuned);
  }

  get equipped(): EquipmentItemBO[] {
    return [...this.weapons, ...this.other].filter((item) => item.equipped);
  }
}

function addTo(
  list: EquipmentItemData[],
  { name, description = '', attuned = false, equipped = false }: NewEquipmentItem,
): EquipmentItemBO {
  const node: EquipmentItemData = {
    id: createId(),
    name: trimmedName(name),
    description,
    attuned,
    equipped,
  };
  list.push(node);
  return new EquipmentItemBO(node, list);
}

export class EquipmentItemBO extends NamedItemBO<EquipmentItemData> {
  get attuned(): boolean {
    return this.node.attuned;
  }

  setAttuned(value: boolean): void {
    this.node.attuned = value;
  }

  get equipped(): boolean {
    return this.node.equipped;
  }

  setEquipped(value: boolean): void {
    this.node.equipped = value;
  }
}
```

- [ ] **Step 4: Attach it to the sheet**

Add `readonly equipment: EquipmentBO;`, assigned from `this.#doc.equipment.weapons` and `this.#doc.equipment.other`.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Prove the tests bite**

Make `attuned` filter on `equipped` — confirm only the attuned test fails. Restore. Make `attuned` read only `this.weapons` — confirm the cross-list test fails. Restore. Store a copy of the filtered array on the instance instead of computing it — confirm the `autorun` test fails (this is the "never cache a value" rule, demonstrated). Restore.

- [ ] **Step 7: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint && npx prettier --check .
git add src/business
git commit -m "feat: add equipment with its derived attuned and equipped views"
```

---

### Task 8: `CategorizedBO` and feats and traits

Written once, used three times. The generic carries the two rules that matter: a category's removal rehomes its items, and an item is in exactly one place.

**Files:**

- Create: `src/business/categorized.ts`, `src/business/featsAndTraits.ts`
- Modify: `src/business/characterSheet.ts`
- Test: `src/business/categorized.test.ts`

**Interfaces:**

- Produces: `class CategorizedBO<TData extends NamedItemData, TItemBO>` with `get categories(): CategoryBO<TData, TItemBO>[]`, `get uncategorized(): TItemBO[]`, `createCategory(name: string): CategoryBO<TData, TItemBO>`, `add(init: NewNamedItem): TItemBO`; `class CategoryBO<TData, TItemBO>` with `get id()`, `get name()`, `setName(v)`, `get items(): TItemBO[]`, `get rawItems(): TData[]`, `add(init): TItemBO`, `remove(): void`; `abstract class CategorizedItemBO<TData> extends NamedItemBO<TData>` with `moveTo(category: CategoryTarget<TData> | null): void`; `interface CategoryTarget<TData> { readonly rawItems: TData[] }`; `class FeatBO extends CategorizedItemBO<FeatData>`; `CharacterSheetBO.featsAndTraits`

**Generic parameter order is `<TData, TItemBO>` everywhere** — the stored shape first, the business object second. Task 9 declares `CountersBO extends CategorizedBO<CounterData, CounterBO>` against exactly this order.

- [ ] **Step 1: Write the failing tests**

```ts
// src/business/categorized.test.ts
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('CategorizedBO', () => {
  it('starts with no categories and nothing uncategorized', () => {
    const { featsAndTraits } = sheetFor();
    expect(featsAndTraits.categories).toEqual([]);
    expect(featsAndTraits.uncategorized).toEqual([]);
  });

  it('adds an item into uncategorized', () => {
    const { featsAndTraits } = sheetFor();
    const rage = featsAndTraits.add({ name: 'Rage' });

    expect(featsAndTraits.uncategorized.map((item) => item.name)).toEqual(['Rage']);
    expect(rage.name).toBe('Rage');
  });

  it('creates a category, appended last', () => {
    const { featsAndTraits } = sheetFor();
    featsAndTraits.createCategory('Combat');
    featsAndTraits.createCategory('Exploration');

    expect(featsAndTraits.categories.map((c) => c.name)).toEqual(['Combat', 'Exploration']);
  });

  it('rejects a duplicate category name', () => {
    const { featsAndTraits } = sheetFor();
    featsAndTraits.createCategory('Combat');

    expect(() => featsAndTraits.createCategory('Combat')).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_NAME' }) as Error,
    );
  });

  it('rejects an empty category name', () => {
    expect(() => sheetFor().featsAndTraits.createCategory('   ')).toThrow(
      expect.objectContaining({ code: 'EMPTY_NAME' }) as Error,
    );
  });

  // Renaming is now a plain field write. It was a one-pass map rebuild when categories were
  // keyed by name, because re-keying is delete-then-insert and moved the entry last.
  it('renames a category without moving it', () => {
    const { featsAndTraits } = sheetFor();
    const combat = featsAndTraits.createCategory('Combat');
    featsAndTraits.createCategory('Exploration');

    combat.setName('Battle');

    expect(featsAndTraits.categories.map((c) => c.name)).toEqual(['Battle', 'Exploration']);
  });

  it('rejects renaming a category onto another category name', () => {
    const { featsAndTraits } = sheetFor();
    const combat = featsAndTraits.createCategory('Combat');
    featsAndTraits.createCategory('Exploration');

    expect(() => combat.setName('Exploration')).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_NAME' }) as Error,
    );
  });

  it('adds an item directly into a category', () => {
    const { featsAndTraits } = sheetFor();
    const combat = featsAndTraits.createCategory('Combat');
    combat.add({ name: 'Rage' });

    expect(combat.items.map((item) => item.name)).toEqual(['Rage']);
    expect(featsAndTraits.uncategorized).toEqual([]);
  });

  // Deleting a category must not delete a player's entries.
  it('moves a removed category\'s items to uncategorized', () => {
    const { featsAndTraits } = sheetFor();
    const combat = featsAndTraits.createCategory('Combat');
    combat.add({ name: 'Rage' });
    combat.add({ name: 'Reckless Attack' });

    combat.remove();

    expect(featsAndTraits.categories).toEqual([]);
    expect(featsAndTraits.uncategorized.map((item) => item.name)).toEqual([
      'Rage',
      'Reckless Attack',
    ]);
  });

  it('throws GONE when a category is removed twice', () => {
    const combat = sheetFor().featsAndTraits.createCategory('Combat');
    combat.remove();
    expect(() => combat.remove()).toThrow(expect.objectContaining({ code: 'GONE' }) as Error);
  });

  it('moves an item from uncategorized into a category', () => {
    const { featsAndTraits } = sheetFor();
    const rage = featsAndTraits.add({ name: 'Rage' });
    const combat = featsAndTraits.createCategory('Combat');

    rage.moveTo(combat);

    expect(combat.items.map((item) => item.name)).toEqual(['Rage']);
    expect(featsAndTraits.uncategorized).toEqual([]);
  });

  it('moves an item back out to uncategorized', () => {
    const { featsAndTraits } = sheetFor();
    const combat = featsAndTraits.createCategory('Combat');
    const rage = combat.add({ name: 'Rage' });

    rage.moveTo(null);

    expect(combat.items).toEqual([]);
    expect(featsAndTraits.uncategorized.map((item) => item.name)).toEqual(['Rage']);
  });

  it('moves an item between categories, leaving it in exactly one', () => {
    const { featsAndTraits } = sheetFor();
    const combat = featsAndTraits.createCategory('Combat');
    const social = featsAndTraits.createCategory('Social');
    const rage = combat.add({ name: 'Rage' });

    rage.moveTo(social);

    expect(combat.items).toEqual([]);
    expect(social.items.map((item) => item.name)).toEqual(['Rage']);
  });

  it('keeps the item usable after a move, writing to its new home', () => {
    const { featsAndTraits } = sheetFor();
    const rage = featsAndTraits.add({ name: 'Rage' });
    const combat = featsAndTraits.createCategory('Combat');

    rage.moveTo(combat);
    rage.setDescription('Once per long rest.');

    expect(combat.items[0]?.description).toBe('Once per long rest.');
  });

  // A moved item must know where it now lives. If it kept pointing at the bucket it left,
  // remove() would search the wrong array and throw GONE for an item that is plainly present.
  it('can be removed after being moved', () => {
    const { featsAndTraits } = sheetFor();
    const rage = featsAndTraits.add({ name: 'Rage' });
    const combat = featsAndTraits.createCategory('Combat');

    rage.moveTo(combat);
    rage.remove();

    expect(combat.items).toEqual([]);
    expect(featsAndTraits.uncategorized).toEqual([]);
  });

  it('can be moved twice', () => {
    const { featsAndTraits } = sheetFor();
    const combat = featsAndTraits.createCategory('Combat');
    const social = featsAndTraits.createCategory('Social');
    const rage = featsAndTraits.add({ name: 'Rage' });

    rage.moveTo(combat);
    rage.moveTo(social);

    expect(combat.items).toEqual([]);
    expect(social.items.map((item) => item.name)).toEqual(['Rage']);
  });

  it('writes through to the saved document', () => {
    const sheet = sheetFor();
    const combat = sheet.featsAndTraits.createCategory('Combat');
    combat.add({ name: 'Rage', description: 'Angry.' });
    sheet.featsAndTraits.add({ name: 'Darkvision' });

    const { featsAndTraits } = sheet.toDocument();
    expect(featsAndTraits.categories).toMatchObject([
      { name: 'Combat', items: [{ name: 'Rage', description: 'Angry.' }] },
    ]);
    expect(featsAndTraits.uncategorized).toMatchObject([{ name: 'Darkvision' }]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/business/categorized.test.ts`
Expected: FAIL — accessor does not exist.

- [ ] **Step 3: Implement the generic**

```ts
// src/business/categorized.ts
import { createId } from './createId.js';
import { RuleViolation } from './errors.js';
import { trimmedName } from './guards.js';
import { NamedItemBO, type NamedItemData } from './namedItem.js';

export interface CategoryData<TData> {
  id: string;
  name: string;
  items: TData[];
}

export interface CategorizedData<TData> {
  categories: CategoryData<TData>[];
  uncategorized: TData[];
}

export interface NewNamedItem {
  name: string;
  description?: string;
}

/**
 * An item that lives inside a `Categorized` shape and can move between its buckets. `moveTo`
 * keeps `categories` and `uncategorized` mutually exclusive: it splices out of the current home
 * before pushing into the new one, so an item is never in two places and never in none.
 */
export abstract class CategorizedItemBO<TData extends NamedItemData> extends NamedItemBO<TData> {
  readonly #owner: CategorizedData<TData>;

  constructor(node: TData, siblings: TData[], owner: CategorizedData<TData>) {
    super(node, siblings);
    this.#owner = owner;
  }

  /**
   * Takes the structural target rather than `CategoryBO<TData, TItemBO>`, because this class
   * knows its data type but not which business object wraps it — naming `CategoryBO` here would
   * need a second type parameter that exists only to be passed straight back.
   */
  moveTo(category: CategoryTarget<TData> | null): void {
    const destination = category === null ? this.#owner.uncategorized : category.rawItems;
    if (destination === this.siblings) return;

    super.remove();
    destination.push(this.node);
    // Repoint, or a later remove() would search the bucket this item just left.
    this.siblings = destination;
  }
}

/** What `moveTo` needs of a destination: somewhere to splice the node into. */
export interface CategoryTarget<TData> {
  readonly rawItems: TData[];
}

type Make<TData extends NamedItemData, TItemBO> = (
  node: TData,
  siblings: TData[],
  owner: CategorizedData<TData>,
) => TItemBO;

export class CategorizedBO<TData extends NamedItemData, TItemBO> {
  readonly #node: CategorizedData<TData>;
  readonly #make: Make<TData, TItemBO>;
  readonly #fill: (init: NewNamedItem) => TData;

  constructor(
    node: CategorizedData<TData>,
    make: Make<TData, TItemBO>,
    fill: (init: NewNamedItem) => TData,
  ) {
    this.#node = node;
    this.#make = make;
    this.#fill = fill;
  }

  get categories(): CategoryBO<TData, TItemBO>[] {
    return this.#node.categories.map(
      (category) => new CategoryBO(category, this.#node, this.#make, this.#fill),
    );
  }

  get uncategorized(): TItemBO[] {
    return this.#node.uncategorized.map((item) =>
      this.#make(item, this.#node.uncategorized, this.#node),
    );
  }

  createCategory(name: string): CategoryBO<TData, TItemBO> {
    const trimmed = trimmedName(name);
    rejectDuplicateCategory(this.#node.categories, trimmed, null);

    const category: CategoryData<TData> = { id: createId(), name: trimmed, items: [] };
    this.#node.categories.push(category);
    return new CategoryBO(category, this.#node, this.#make, this.#fill);
  }

  /** New items land in `uncategorized`; the player files them afterwards. */
  add(init: NewNamedItem): TItemBO {
    const node = this.#fill(init);
    this.#node.uncategorized.push(node);
    return this.#make(node, this.#node.uncategorized, this.#node);
  }
}

export class CategoryBO<TData extends NamedItemData, TItemBO> {
  readonly #node: CategoryData<TData>;
  readonly #owner: CategorizedData<TData>;
  readonly #make: Make<TData, TItemBO>;
  readonly #fill: (init: NewNamedItem) => TData;

  constructor(
    node: CategoryData<TData>,
    owner: CategorizedData<TData>,
    make: Make<TData, TItemBO>,
    fill: (init: NewNamedItem) => TData,
  ) {
    this.#node = node;
    this.#owner = owner;
    this.#make = make;
    this.#fill = fill;
  }

  get id(): string {
    return this.#node.id;
  }

  get name(): string {
    return this.#node.name;
  }

  /** A plain field write. Array position is the display order, so a rename cannot move it. */
  setName(value: string): void {
    const trimmed = trimmedName(value);
    this.#require();
    rejectDuplicateCategory(this.#owner.categories, trimmed, this.#node);
    this.#node.name = trimmed;
  }

  get items(): TItemBO[] {
    return this.#node.items.map((item) => this.#make(item, this.#node.items, this.#owner));
  }

  /** The raw array, so `moveTo` can splice into it. Not part of the UI-facing surface. */
  get rawItems(): TData[] {
    return this.#node.items;
  }

  add(init: NewNamedItem): TItemBO {
    const node = this.#fill(init);
    this.#node.items.push(node);
    return this.#make(node, this.#node.items, this.#owner);
  }

  /** Rehomes the category's items before deleting it — removing a category is not a bulk delete. */
  remove(): void {
    const index = this.#require();
    this.#owner.uncategorized.push(...this.#node.items);
    this.#owner.categories.splice(index, 1);
  }

  #require(): number {
    const index = this.#owner.categories.indexOf(this.#node);
    if (index === -1) {
      throw new RuleViolation('GONE', `the category "${this.#node.name}" is no longer present`);
    }
    return index;
  }
}

function rejectDuplicateCategory<TData>(
  categories: readonly CategoryData<TData>[],
  name: string,
  except: CategoryData<TData> | null,
) {
  if (categories.some((entry) => entry !== except && entry.name === name)) {
    throw new RuleViolation('DUPLICATE_NAME', `a category named "${name}" already exists`);
  }
}
```

- [ ] **Step 4: Implement `FeatBO` and attach it**

```ts
// src/business/featsAndTraits.ts
import { CategorizedBO, CategorizedItemBO, type NewNamedItem } from './categorized.js';
import { createId } from './createId.js';
import { trimmedName } from './guards.js';
import type { FeatData } from './types.js';

export class FeatBO extends CategorizedItemBO<FeatData> {}

export const featFill = ({ name, description = '' }: NewNamedItem): FeatData => ({
  id: createId(),
  name: trimmedName(name),
  description,
});

export type FeatsAndTraitsBO = CategorizedBO<FeatData, FeatBO>;

export const makeFeatsAndTraits = (node: FeatsAndTraitsData): FeatsAndTraitsBO =>
  new CategorizedBO<FeatData, FeatBO>(
    node,
    (item, siblings, owner) => new FeatBO(item, siblings, owner),
    featFill,
  );
```

with `import type { FeatData, FeatsAndTraitsData } from './types.js';` at the top.

Add the three container aliases to `src/business/types.ts` now — Task 9 uses the other two:

```ts
export type FeatsAndTraitsData = CharacterDocument['featsAndTraits'];
export type SpellListData = CharacterDocument['spellList'];
export type CountersData = CharacterDocument['counters'];
```

Then in `characterSheet.ts` add `readonly featsAndTraits: FeatsAndTraitsBO;`, assigned with `makeFeatsAndTraits(this.#doc.featsAndTraits)`.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Prove the tests bite**

Delete the `this.#owner.uncategorized.push(...)` line in `CategoryBO.remove` — confirm only the rehoming test fails. Restore. In `moveTo`, push without splicing first — confirm the move tests fail on the item appearing in two places. Restore. Remove the duplicate-category check — confirm only the duplicate-name tests fail. Restore. Make `createCategory` `unshift` instead of `push` — confirm only the appended-last test fails. Restore.

- [ ] **Step 7: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint && npx prettier --check .
git add src/business
git commit -m "feat: add the categorized generic and feats and traits

Removing a category rehomes its items rather than deleting them, and
moveTo keeps categories and uncategorized mutually exclusive."
```

---

### Task 9: Spell list and counters

Two more uses of the same generic, plus the nine fixed spell slots.

**Files:**

- Create: `src/business/spellList.ts`, `src/business/counters.ts`
- Modify: `src/business/characterSheet.ts`, `src/business/types.ts`
- Test: `src/business/spellList.test.ts`, `src/business/counters.test.ts`

**Interfaces:**

- Produces: `class SpellBO extends CategorizedItemBO<SpellData>` with `get level(): SpellLevel`, `setLevel(v)`, `get prepared()`, `setPrepared(b)`; `type SpellLevel = 'c' | 1|2|3|4|5|6|7|8|9`; `class CounterBO extends CategorizedItemBO<CounterData>` with `get current()`, `setCurrent(n)`, `get total()`, `setTotal(n)`; `class SpellSlotBO` with `get level(): number`, `get current()`, `setCurrent(n)`, `get total()`, `setTotal(n)`; `class CountersBO` wrapping the categorized shape plus `get spellSlots(): SpellSlotBO[]`; `CharacterSheetBO.spellList`, `CharacterSheetBO.counters`

- [ ] **Step 1: Write the failing tests**

```ts
// src/business/spellList.test.ts
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('SpellBO', () => {
  it('defaults a new spell to cantrip level and unprepared', () => {
    const spell = sheetFor().spellList.add({ name: 'Fire Bolt' });
    expect([spell.level, spell.prepared]).toEqual(['c', false]);
  });

  it.each(['c', 1, 5, 9] as const)('accepts %j as a level', (level) => {
    const spell = sheetFor().spellList.add({ name: 'Fire Bolt' });
    spell.setLevel(level);
    expect(spell.level).toBe(level);
  });

  it('toggles prepared', () => {
    const spell = sheetFor().spellList.add({ name: 'Fire Bolt' });
    spell.setPrepared(true);
    expect(spell.prepared).toBe(true);
  });

  it('supports the same categories as feats, because it uses the same generic', () => {
    const sheet = sheetFor();
    const evocation = sheet.spellList.createCategory('Evocation');
    const bolt = evocation.add({ name: 'Fire Bolt' });

    bolt.moveTo(null);

    expect(evocation.items).toEqual([]);
    expect(sheet.spellList.uncategorized.map((s) => s.name)).toEqual(['Fire Bolt']);
  });

  it('writes through to the saved document', () => {
    const sheet = sheetFor();
    const spell = sheet.spellList.add({ name: 'Fire Bolt' });
    spell.setLevel(3);
    spell.setPrepared(true);

    expect(sheet.toDocument().spellList.uncategorized).toMatchObject([
      { name: 'Fire Bolt', level: 3, prepared: true },
    ]);
  });
});
```

```ts
// src/business/counters.test.ts
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('CountersBO', () => {
  it('defaults a new counter to zero and zero', () => {
    const counter = sheetFor().counters.add({ name: 'Rage' });
    expect([counter.current, counter.total]).toEqual([0, 0]);
  });

  it('rejects a negative current', () => {
    const counter = sheetFor().counters.add({ name: 'Rage' });
    expect(() => counter.setCurrent(-1)).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
  });

  it('supports categories, because it uses the same generic', () => {
    const sheet = sheetFor();
    const features = sheet.counters.createCategory('Class features');
    features.add({ name: 'Rage' });

    expect(features.items.map((item) => item.name)).toEqual(['Rage']);
  });
});

describe('spell slots', () => {
  it('exposes exactly nine levels, 1 through 9, in order', () => {
    expect(sheetFor().counters.spellSlots.map((slot) => slot.level)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it('starts every level at zero', () => {
    const slots = sheetFor().counters.spellSlots;
    expect(slots.every((slot) => slot.current === 0 && slot.total === 0)).toBe(true);
  });

  it('writes a level independently of the others', () => {
    const sheet = sheetFor();
    sheet.counters.spellSlots[2]?.setTotal(3);

    const { spellSlots } = sheet.toDocument().counters;
    expect(spellSlots['3']).toEqual({ current: 0, total: 3 });
    expect(spellSlots['4']).toEqual({ current: 0, total: 0 });
  });

  it('offers no way to add or remove a level, because the nine are fixed', () => {
    const { spellSlots } = sheetFor().counters;
    expect(spellSlots).toHaveLength(9);
    expect(sheetFor().counters).not.toHaveProperty('addSpellSlot');
  });

  it('rejects a negative value', () => {
    const slot = sheetFor().counters.spellSlots[0];
    expect(() => slot?.setCurrent(-1)).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/business/spellList.test.ts src/business/counters.test.ts`
Expected: FAIL — neither accessor exists.

- [ ] **Step 3: Implement the spell list**

```ts
// src/business/spellList.ts
import { CategorizedBO, CategorizedItemBO, type NewNamedItem } from './categorized.js';
import { createId } from './createId.js';
import { trimmedName } from './guards.js';
import type { SpellData, SpellListData } from './types.js';

/** 'c' for cantrip, then 1 to 9. The wireframe's 0 is not authoritative (spec section 3.1). */
export type SpellLevel = SpellData['level'];

export class SpellBO extends CategorizedItemBO<SpellData> {
  get level(): SpellLevel {
    return this.node.level;
  }

  setLevel(value: SpellLevel): void {
    this.node.level = value;
  }

  get prepared(): boolean {
    return this.node.prepared;
  }

  setPrepared(value: boolean): void {
    this.node.prepared = value;
  }
}

export type SpellListBO = CategorizedBO<SpellData, SpellBO>;

export const makeSpellList = (node: SpellListData): SpellListBO =>
  new CategorizedBO<SpellData, SpellBO>(
    node,
    (item, siblings, owner) => new SpellBO(item, siblings, owner),
    ({ name, description = '' }: NewNamedItem): SpellData => ({
      id: createId(),
      name: trimmedName(name),
      description,
      level: 'c',
      prepared: false,
    }),
  );
```

- [ ] **Step 4: Implement counters and spell slots**

```ts
// src/business/counters.ts
import { CategorizedBO, CategorizedItemBO, type NewNamedItem } from './categorized.js';
import { createId } from './createId.js';
import { nonNegativeInt, trimmedName } from './guards.js';
import type { CounterData, CountersData, SpellSlotData } from './types.js';

const SPELL_SLOT_LEVELS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export class CounterBO extends CategorizedItemBO<CounterData> {
  get current(): number {
    return this.node.current;
  }

  setCurrent(value: number): void {
    this.node.current = nonNegativeInt(value);
  }

  get total(): number {
    return this.node.total;
  }

  setTotal(value: number): void {
    this.node.total = nonNegativeInt(value);
  }
}

/** One of nine fixed levels. The key is the identity, so there is no id and no add or remove. */
export class SpellSlotBO {
  readonly #node: SpellSlotData;
  readonly #level: number;

  constructor(node: SpellSlotData, level: number) {
    this.#node = node;
    this.#level = level;
  }

  get level(): number {
    return this.#level;
  }

  get current(): number {
    return this.#node.current;
  }

  setCurrent(value: number): void {
    this.#node.current = nonNegativeInt(value);
  }

  get total(): number {
    return this.#node.total;
  }

  setTotal(value: number): void {
    this.#node.total = nonNegativeInt(value);
  }
}

/**
 * The categorized shape plus the nine fixed spell slots, which sit alongside the categories in
 * the stored document rather than inside them.
 */
export class CountersBO extends CategorizedBO<CounterData, CounterBO> {
  readonly #node: CountersData;

  constructor(node: CountersData) {
    super(
      node,
      (item, siblings, owner) => new CounterBO(item, siblings, owner),
      ({ name, description = '' }: NewNamedItem): CounterData => ({
        id: createId(),
        name: trimmedName(name),
        description,
        current: 0,
        total: 0,
      }),
    );
    this.#node = node;
  }

  get spellSlots(): SpellSlotBO[] {
    return SPELL_SLOT_LEVELS.map((key) => new SpellSlotBO(this.#node.spellSlots[key], Number(key)));
  }
}
```

Note that `SPELL_SLOT_LEVELS` is duplicated here rather than imported: `schema/index.ts` deliberately does not export it, because it is a fact about one schema version, and `src/business/` may not import a version directory. If v2 changed the set, this list would need changing too — which is the point, since the business layer would need deliberate updating either way.

- [ ] **Step 5: Attach both to the sheet**

`SpellListData` and `CountersData` were added to `src/business/types.ts` in Task 8; use them as they are.

In `characterSheet.ts` add `readonly spellList: SpellListBO;` and `readonly counters: CountersBO;`, assigned with `makeSpellList(this.#doc.spellList)` and `new CountersBO(this.#doc.counters)`.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 7: Prove the tests bite**

Make `spellSlots` return only eight levels — confirm only the nine-levels test fails. Restore. Make `setTotal` on a slot write to level 1 regardless — confirm only the independence test fails. Restore. Default a new spell to level 1 instead of `'c'` — confirm only the defaults test fails. Restore.

- [ ] **Step 8: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint && npx prettier --check .
git add src/business
git commit -m "feat: add the spell list and counters, including the nine spell slots"
```

---

### Task 10: Abilities and skills

Two fixed-key groups: six abilities with four fields each, eighteen skills with three. Three written classes; 78 call sites.

**Files:**

- Create: `src/business/abilitiesAndSkills.ts`
- Modify: `src/business/characterSheet.ts`
- Test: `src/business/abilitiesAndSkills.test.ts`

**Interfaces:**

- Produces: `class AbilitiesAndSkillsBO` with `get proficiencyBonus()`, `setProficiencyBonus(n)`, `get passivePerception()`, `setPassivePerception(n)`, `get speed()`, `setSpeed(n)`, `readonly abilities: Record<AbilityKey, AbilityBO>`, `readonly skills: Record<SkillKey, SkillBO>`; `class AbilityBO` with `get score()`, `setScore(n)`, `get modifier()`, `setModifier(n)`, `get savingThrowModifier()`, `setSavingThrowModifier(n)`, `get savingThrowProficient()`, `setSavingThrowProficient(b)`; `class SkillBO` with `get modifier()`, `setModifier(n)`, `get proficient()`, `setProficient(b)`, `get expertise()`, `setExpertise(b)`; `CharacterSheetBO.abilitiesAndSkills`

- [ ] **Step 1: Write the failing tests**

```ts
// src/business/abilitiesAndSkills.test.ts
import { describe, expect, it } from 'vitest';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

const ABILITIES = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const;

const SKILLS = [
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

describe('AbilitiesAndSkillsBO', () => {
  it('exposes all six abilities and all eighteen skills', () => {
    const { abilitiesAndSkills } = sheetFor();
    expect(Object.keys(abilitiesAndSkills.abilities)).toEqual([...ABILITIES]);
    expect(Object.keys(abilitiesAndSkills.skills)).toEqual([...SKILLS]);
  });

  it.each([
    ['setProficiencyBonus', 'proficiencyBonus'],
    ['setPassivePerception', 'passivePerception'],
    ['setSpeed', 'speed'],
  ] as const)('%s writes %s', (setter, getter) => {
    const { abilitiesAndSkills } = sheetFor();
    abilitiesAndSkills[setter](3);
    expect(abilitiesAndSkills[getter]).toBe(3);
  });

  it.each(['setProficiencyBonus', 'setPassivePerception', 'setSpeed'] as const)(
    '%s rejects a negative',
    (setter) => {
      const { abilitiesAndSkills } = sheetFor();
      expect(() => abilitiesAndSkills[setter](-1)).toThrow(
        expect.objectContaining({ code: 'NEGATIVE' }) as Error,
      );
    },
  );
});

describe('AbilityBO', () => {
  it.each(ABILITIES)('%s writes its four fields independently', (key) => {
    const { abilities } = sheetFor().abilitiesAndSkills;
    const ability = abilities[key];

    ability.setScore(16);
    ability.setModifier(3);
    ability.setSavingThrowModifier(5);
    ability.setSavingThrowProficient(true);

    expect([
      ability.score,
      ability.modifier,
      ability.savingThrowModifier,
      ability.savingThrowProficient,
    ]).toEqual([16, 3, 5, true]);
  });

  it('writes one ability without touching another', () => {
    const { abilities } = sheetFor().abilitiesAndSkills;
    abilities.strength.setScore(16);
    expect(abilities.dexterity.score).toBe(0);
  });

  // Modifiers are the only signed fields in the document (spec section 3.3). They are entered
  // by the player, never computed from the score — the app computes nothing.
  it('accepts a negative modifier, which is the only signed field family', () => {
    const { abilities } = sheetFor().abilitiesAndSkills;
    abilities.strength.setModifier(-1);
    expect(abilities.strength.modifier).toBe(-1);
  });

  it('rejects a negative score, which is not signed', () => {
    const { abilities } = sheetFor().abilitiesAndSkills;
    expect(() => abilities.strength.setScore(-1)).toThrow(
      expect.objectContaining({ code: 'NEGATIVE' }) as Error,
    );
  });

  it('never derives the modifier from the score', () => {
    const { abilities } = sheetFor().abilitiesAndSkills;
    abilities.strength.setScore(16);
    expect(abilities.strength.modifier).toBe(0);
  });

  it('has no ability-check proficiency flag, which was dropped as having no referent', () => {
    const { abilities } = sheetFor().abilitiesAndSkills;
    expect(abilities.strength).not.toHaveProperty('proficient');
    expect(abilities.strength).not.toHaveProperty('setProficient');
  });
});

describe('SkillBO', () => {
  it.each(SKILLS)('%s writes its three fields independently', (key) => {
    const { skills } = sheetFor().abilitiesAndSkills;
    const skill = skills[key];

    skill.setModifier(3);
    skill.setProficient(true);
    skill.setExpertise(true);

    expect([skill.modifier, skill.proficient, skill.expertise]).toEqual([3, true, true]);
  });

  it('accepts a negative modifier', () => {
    const { skills } = sheetFor().abilitiesAndSkills;
    skills.stealth.setModifier(-2);
    expect(skills.stealth.modifier).toBe(-2);
  });

  it('rejects a non-integer modifier', () => {
    const { skills } = sheetFor().abilitiesAndSkills;
    expect(() => skills.stealth.setModifier(1.5)).toThrow(
      expect.objectContaining({ code: 'NOT_AN_INTEGER' }) as Error,
    );
  });

  it('writes through to the saved document', () => {
    const sheet = sheetFor();
    sheet.abilitiesAndSkills.skills.stealth.setProficient(true);

    expect(sheet.toDocument().abilitiesAndSkills.skills.stealth).toEqual({
      modifier: 0,
      proficient: true,
      expertise: false,
    });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run src/business/abilitiesAndSkills.test.ts`
Expected: FAIL — accessor does not exist.

- [ ] **Step 3: Implement it**

```ts
// src/business/abilitiesAndSkills.ts
import { integer, nonNegativeInt } from './guards.js';
import type { AbilityData, CharacterData, SkillData } from './types.js';

type AbilitiesAndSkillsData = CharacterData['abilitiesAndSkills'];
export type AbilityKey = keyof AbilitiesAndSkillsData['abilities'];
export type SkillKey = keyof AbilitiesAndSkillsData['skills'];

export class AbilitiesAndSkillsBO {
  readonly #node: AbilitiesAndSkillsData;
  readonly abilities: Record<AbilityKey, AbilityBO>;
  readonly skills: Record<SkillKey, SkillBO>;

  constructor(node: AbilitiesAndSkillsData) {
    this.#node = node;

    // Fixed key sets, so every object is built once in the constructor. There is nothing to add
    // or remove, and the keys are the identity, so none of these carry an id.
    this.abilities = Object.fromEntries(
      Object.keys(node.abilities).map((key) => [
        key,
        new AbilityBO(node.abilities[key as AbilityKey]),
      ]),
    ) as Record<AbilityKey, AbilityBO>;

    this.skills = Object.fromEntries(
      Object.keys(node.skills).map((key) => [key, new SkillBO(node.skills[key as SkillKey])]),
    ) as Record<SkillKey, SkillBO>;
  }

  get proficiencyBonus(): number {
    return this.#node.proficiencyBonus;
  }

  setProficiencyBonus(value: number): void {
    this.#node.proficiencyBonus = nonNegativeInt(value);
  }

  get passivePerception(): number {
    return this.#node.passivePerception;
  }

  /** Player-entered, never computed from the perception skill. The app computes nothing. */
  setPassivePerception(value: number): void {
    this.#node.passivePerception = nonNegativeInt(value);
  }

  get speed(): number {
    return this.#node.speed;
  }

  setSpeed(value: number): void {
    this.#node.speed = nonNegativeInt(value);
  }
}

/** No `proficient`: ability-check proficiency has no referent in the rules (spec section 3.1). */
export class AbilityBO {
  readonly #node: AbilityData;

  constructor(node: AbilityData) {
    this.#node = node;
  }

  get score(): number {
    return this.#node.score;
  }

  setScore(value: number): void {
    this.#node.score = nonNegativeInt(value);
  }

  get modifier(): number {
    return this.#node.modifier;
  }

  /** Signed, and entered by the player — never derived from the score. */
  setModifier(value: number): void {
    this.#node.modifier = integer(value);
  }

  get savingThrowModifier(): number {
    return this.#node.savingThrowModifier;
  }

  setSavingThrowModifier(value: number): void {
    this.#node.savingThrowModifier = integer(value);
  }

  get savingThrowProficient(): boolean {
    return this.#node.savingThrowProficient;
  }

  setSavingThrowProficient(value: boolean): void {
    this.#node.savingThrowProficient = value;
  }
}

export class SkillBO {
  readonly #node: SkillData;

  constructor(node: SkillData) {
    this.#node = node;
  }

  get modifier(): number {
    return this.#node.modifier;
  }

  setModifier(value: number): void {
    this.#node.modifier = integer(value);
  }

  get proficient(): boolean {
    return this.#node.proficient;
  }

  setProficient(value: boolean): void {
    this.#node.proficient = value;
  }

  get expertise(): boolean {
    return this.#node.expertise;
  }

  setExpertise(value: boolean): void {
    this.#node.expertise = value;
  }
}
```

- [ ] **Step 4: Attach it to the sheet**

Add `readonly abilitiesAndSkills: AbilitiesAndSkillsBO;`, assigned from `this.#doc.abilitiesAndSkills`.

- [ ] **Step 5: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Prove the tests bite**

Make `setModifier` use `nonNegativeInt` — confirm only the negative-modifier tests fail. Restore. Make `setScore` use `integer` — confirm only the negative-score test fails. Restore. Build the `abilities` record from a hard-coded list of five keys — confirm only the six-abilities test fails. Restore.

- [ ] **Step 7: Typecheck, lint and commit**

```bash
npm run typecheck && npm run lint && npx prettier --check .
git add src/business
git commit -m "feat: add abilities and skills

Modifiers stay player-entered and signed: the app never derives one from
a score, which is the single thing it exists not to do."
```

---

### Task 11: The public barrel and a whole-tree proof

The tree is complete; this task fixes what the UI may see and proves the document survives a full round trip.

**Files:**

- Create: `src/business/index.ts`, `src/business/characterSheet.roundTrip.test.ts`
- Modify: `AGENTS.md`

**Interfaces:**

- Produces: `src/business/index.ts` exporting `CharacterSheetBO`, every `*BO` class the UI names in a type position, `RuleViolation`, `RuleCode`, and the `New*` input types — and deliberately not the `*Data` aliases

- [ ] **Step 1: Write the failing round-trip test**

```ts
// src/business/characterSheet.roundTrip.test.ts
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA, createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

/** Exercises every branch of the tree, so the assertions below speak for the whole document. */
function fill(sheet: CharacterSheetBO): void {
  sheet.setName('Sable Nightwind');
  sheet.setArmorClass(15);
  sheet.classes.add({ name: 'Rogue', level: 5 });
  sheet.hitPoints.setTotal(45);
  sheet.hitDices.add(8).setTotal(5);
  sheet.journalAndNotes.appendDay('Arrived in Barovia.');
  sheet.journalAndNotes.setNotes('Find the Sunsword.');
  sheet.inventory.coins.setGp(84);
  sheet.inventory.add({ name: 'Rope', count: 1 });
  sheet.equipment.addWeapon({ name: 'Rapier', equipped: true });
  sheet.equipment.addOther({ name: 'Cloak', attuned: true });
  sheet.featsAndTraits.createCategory('Combat').add({ name: 'Sneak Attack' });
  sheet.featsAndTraits.add({ name: 'Darkvision' });
  sheet.spellList.createCategory('Evocation').add({ name: 'Fire Bolt' });
  sheet.counters.createCategory('Class features').add({ name: 'Rage' });
  sheet.counters.spellSlots[0]?.setTotal(4);
  sheet.abilitiesAndSkills.setSpeed(30);
  sheet.abilitiesAndSkills.abilities.dexterity.setScore(18);
  sheet.abilitiesAndSkills.abilities.dexterity.setModifier(4);
  sheet.abilitiesAndSkills.skills.stealth.setProficient(true);
}

describe('the business object tree, end to end', () => {
  // The single most important property of this layer: the UI can only reach it through named
  // methods, so it cannot leave the document in a state the schema would reject — and autosave
  // validates then REFUSES loudly, so an invalid document stops all saving for that character.
  it('cannot produce a document the current schema rejects', () => {
    const sheet = sheetFor();
    fill(sheet);

    const result = CURRENT_SCHEMA.safeParse(sheet.toDocument());
    expect(result.success).toBe(true);
  });

  it('round-trips through the schema unchanged', () => {
    const sheet = sheetFor();
    fill(sheet);

    const doc = sheet.toDocument();
    expect(CURRENT_SCHEMA.parse(doc)).toEqual(doc);
  });

  it('survives a JSON round trip, so the file and memory agree', () => {
    const sheet = sheetFor();
    fill(sheet);

    const doc = sheet.toDocument();
    const reopened = new CharacterSheetBO(CURRENT_SCHEMA.parse(JSON.parse(JSON.stringify(doc))));

    expect(reopened.toDocument()).toEqual(doc);
  });

  it('puts no derived value in the saved document', () => {
    const sheet = sheetFor();
    fill(sheet);
    const doc = sheet.toDocument();

    expect(sheet.level).toBe(5);
    expect(doc).not.toHaveProperty('level');
    expect(doc.equipment).not.toHaveProperty('attuned');
    expect(doc.equipment).not.toHaveProperty('equipped');
  });

  it('mints a unique id for every item, which the schema enforces document-wide', () => {
    const sheet = sheetFor();
    fill(sheet);
    // A duplicate id anywhere would fail CURRENT_SCHEMA, so the first assertion already covers
    // this — but stating it separately names the property, so a failure reads as what it is.
    expect(CURRENT_SCHEMA.safeParse(sheet.toDocument()).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails or passes for the right reason**

Run: `npx vitest run src/business/characterSheet.roundTrip.test.ts`
Expected: PASS if Tasks 2-10 are correct. If it fails, the failure is a genuine defect in an earlier task — fix it rather than weakening this test.

- [ ] **Step 3: Write the barrel**

```ts
// src/business/index.ts

/**
 * The business layer's public face. `src/ui/` imports from here and nowhere else in this
 * directory.
 *
 * Deliberately absent: every `*Data` alias from `./types.js`. Those are the stored shapes, and
 * exporting one would put the document's structure back into UI signatures — which is the thing
 * this layer exists to prevent.
 */
export { CharacterSheetBO } from './characterSheet.js';
export { RuleViolation, type RuleCode } from './errors.js';
export { ClassesBO, ClassBO, type NewClass } from './classes.js';
export { HitPointsBO } from './hitPoints.js';
export { HitDicesBO, HitDieBO } from './hitDices.js';
export { JournalAndNotesBO, JournalDayBO } from './journalAndNotes.js';
export { InventoryBO, CoinsBO, InventoryItemBO, type NewInventoryItem } from './inventory.js';
export { EquipmentBO, EquipmentItemBO, type NewEquipmentItem } from './equipment.js';
export { CategorizedBO, CategoryBO, CategorizedItemBO, type NewNamedItem } from './categorized.js';
export { FeatBO, type FeatsAndTraitsBO } from './featsAndTraits.js';
export { SpellBO, type SpellLevel, type SpellListBO } from './spellList.js';
export { CountersBO, CounterBO, SpellSlotBO } from './counters.js';
export {
  AbilitiesAndSkillsBO,
  AbilityBO,
  SkillBO,
  type AbilityKey,
  type SkillKey,
} from './abilitiesAndSkills.js';
```

- [ ] **Step 4: Prove the barrel withholds what it should**

Add to `src/business/characterSheet.roundTrip.test.ts`:

```ts
it('does not export the stored shapes from the public barrel', async () => {
  const barrel = await import('./index.js');
  // Types vanish at runtime, so this checks the value exports only — the real guard is that
  // `types.ts` is never re-exported, which a reader can see in index.ts at a glance.
  expect(Object.keys(barrel)).not.toContain('types');
  expect(barrel).not.toHaveProperty('CharacterData');
});
```

- [ ] **Step 5: Run everything**

Run: `npm test && npm run typecheck && npm run lint && npx prettier --check .`
Expected: all pass.

- [ ] **Step 6: Update `AGENTS.md`**

Under "Current state", record that the business object tree now exists: `src/business/` holds `CharacterSheetBO` and the object tree, the document is private behind a `#` field, and the library, autosave and storage objects are still to come. Under "Map", add the `src/business/` entries. Keep the existing prose style — say why, not just what.

- [ ] **Step 7: Commit**

```bash
npm test && npm run typecheck && npm run lint && npx prettier --check .
git add src/business AGENTS.md
git commit -m "feat: add the business layer's public barrel and a whole-tree proof

The round-trip test asserts the tree cannot produce a document the current
schema rejects, which is what makes autosave's refuse-loudly policy safe."
```

---

## What this plan does not cover

Spec §5 and §6 are a second plan: `CharacterLibraryBO`, `CharacterEntryBO`, `CharacterFile`, `StorageBO`, `Autosave`, and the re-export of `describeLoadError`. They need `mobx-utils`' `deepObserve`, which this plan does not install.

Three items are deliberately absent here and belong to that plan:

- **`CharacterSheetBO.dispose()`** — it stops autosave, and there is no autosave yet. Spec §4 lists it on the sheet; it arrives with `Autosave`.
- **The persistence gate** — `navigator.storage.persisted()`/`persist()` is app-global state on `StorageBO`, not per character.
- **`onFailure` wiring** — the repository already accepts an observer; `StorageBO` is what will pass one.
