import { describe, expect, it } from 'vitest';
import { CURRENT, SCHEMAS } from '../schema/index.js';
import { ID_A, v7DocFor } from '../../test/fixtures.js';
import { parseCharacter } from './parseCharacter.js';
import { migrateV7ToV8 } from './v7ToV8.js';

type Named = { name: string }[];
interface Sheet {
  classes: Named;
  spellList: { uncategorized: Named };
  featsAndTraits: { uncategorized: Named };
  counters: { uncategorized: Named };
}

describe('migrateV7ToV8', () => {
  it('adds an empty companions list and changes nothing else', () => {
    const v7 = v7DocFor(ID_A, 'Sable') as unknown as Sheet;
    // The bait is really there, so the assertion below means something: a Ranger, Find Familiar,
    // Primal Companion and an "Owl HP" counter, none of which may become a companion.
    expect(v7.classes.map((c) => c.name)).toContain('Ranger');
    expect(v7.spellList.uncategorized.map((s) => s.name)).toContain('Find Familiar');
    expect(v7.featsAndTraits.uncategorized.map((f) => f.name)).toContain('Primal Companion');
    expect(v7.counters.uncategorized.map((c) => c.name)).toContain('Owl HP');

    expect(migrateV7ToV8(v7)).toEqual({ ...(v7 as object), schemaVersion: 8, companions: [] });
  });

  it('puts companions last', () => {
    const v7 = v7DocFor(ID_A, 'Sable');
    expect(Object.keys(migrateV7ToV8(v7) as object)).toEqual([...Object.keys(v7), 'companions']);
  });

  it('produces a valid v8 document', () => {
    expect(SCHEMAS[8]!.safeParse(migrateV7ToV8(v7DocFor(ID_A, 'Sable'))).success).toBe(true);
  });

  it('does not mutate its input', () => {
    const v7 = v7DocFor(ID_A, 'Sable');
    const before = structuredClone(v7);
    migrateV7ToV8(v7);
    expect(v7).toEqual(before);
  });
});

describe('parseCharacter on a v7 document', () => {
  // Asserts this step ran, not where the chain ends, so the next version does not break it.
  it('runs it through this migration on the way to the current version', () => {
    const result = parseCharacter(v7DocFor(ID_A, 'Sable'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.doc.schemaVersion).toBe(CURRENT);
      expect(result.doc.companions).toEqual([]);
    }
  });
});
