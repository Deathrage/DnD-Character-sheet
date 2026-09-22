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

  it.each(['setCurrent', 'setTotal', 'setTemporary'] as const)(
    '%s rejects a negative',
    (setter) => {
      const { hitPoints } = sheetFor();
      expect(() => hitPoints[setter](-1)).toThrow(
        expect.objectContaining({ code: 'NEGATIVE' }) as Error,
      );
    },
  );

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
