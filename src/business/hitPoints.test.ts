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

describe('DeathSavesBO', () => {
  it('starts with nothing ticked', () => {
    const { deathSaves } = sheetFor().hitPoints;
    expect([deathSaves.successes, deathSaves.failures]).toEqual([0, 0]);
  });

  it.each([
    ['setSuccesses', 'successes'],
    ['setFailures', 'failures'],
  ] as const)('%s writes %s, and only it', (setter, getter) => {
    const sheet = sheetFor();
    sheet.hitPoints.deathSaves[setter](2);
    expect(sheet.hitPoints.deathSaves[getter]).toBe(2);
    expect(sheet.toDocument().hitPoints.deathSaves).toEqual({
      successes: getter === 'successes' ? 2 : 0,
      failures: getter === 'failures' ? 2 : 0,
    });
  });

  it.each(['setSuccesses', 'setFailures'] as const)(
    '%s takes every count from 0 to 3',
    (setter) => {
      const { deathSaves } = sheetFor().hitPoints;
      for (const count of [0, 1, 2, 3]) {
        expect(() => deathSaves[setter](count)).not.toThrow();
      }
    },
  );

  it.each(['setSuccesses', 'setFailures'] as const)(
    '%s rejects a fourth tick: a sheet has three boxes',
    (setter) => {
      const { deathSaves } = sheetFor().hitPoints;
      expect(() => deathSaves[setter](4)).toThrow(
        expect.objectContaining({ code: 'ABOVE_THREE' }) as Error,
      );
    },
  );

  it.each([
    ['setSuccesses', -1, 'NEGATIVE'],
    ['setFailures', -1, 'NEGATIVE'],
    ['setSuccesses', 1.5, 'NOT_AN_INTEGER'],
    ['setFailures', 1.5, 'NOT_AN_INTEGER'],
  ] as const)('%s(%j) is %s', (setter, value, code) => {
    const { deathSaves } = sheetFor().hitPoints;
    expect(() => deathSaves[setter](value)).toThrow(expect.objectContaining({ code }) as Error);
  });

  it('clear() unticks both sides', () => {
    const sheet = sheetFor();
    sheet.hitPoints.deathSaves.setSuccesses(2);
    sheet.hitPoints.deathSaves.setFailures(3);
    sheet.hitPoints.deathSaves.clear();
    expect(sheet.toDocument().hitPoints.deathSaves).toEqual({ successes: 0, failures: 0 });
  });

  // Not a rule: 0 hit points is a number the player typed, and the boxes are theirs to tick. Each
  // of these would be the app playing the game.
  describe('never acts on its own', () => {
    it('ticks nothing when hit points drop to 0', () => {
      const sheet = sheetFor();
      sheet.hitPoints.setTotal(24);
      sheet.hitPoints.setCurrent(10);
      sheet.hitPoints.setCurrent(0);
      expect(sheet.toDocument().hitPoints.deathSaves).toEqual({ successes: 0, failures: 0 });
    });

    it('keeps the ticks when hit points rise above 0', () => {
      const sheet = sheetFor();
      sheet.hitPoints.deathSaves.setSuccesses(1);
      sheet.hitPoints.deathSaves.setFailures(2);
      sheet.hitPoints.setCurrent(5);
      expect(sheet.toDocument().hitPoints.deathSaves).toEqual({ successes: 1, failures: 2 });
    });

    it('lets them be ticked at any hit points', () => {
      const sheet = sheetFor();
      sheet.hitPoints.setCurrent(30);
      sheet.hitPoints.deathSaves.setFailures(3);
      expect(sheet.hitPoints.deathSaves.failures).toBe(3);
      expect(sheet.hitPoints.current).toBe(30);
    });
  });
});
