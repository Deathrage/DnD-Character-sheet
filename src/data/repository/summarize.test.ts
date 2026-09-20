import { describe, expect, it } from 'vitest';
import { ID_A, docFor } from '../../test/fixtures.js';
import { summarize } from './summarize.js';

const base = () => docFor(ID_A, 'Sable Nightwind');

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

  it('returns copies, so editing a summary cannot reach back into the document', () => {
    // The test above only proves summarize() does not mutate while it runs. A summary that
    // shared structure with the document would still let a caller — a list row bound to an
    // editable field, say — write through to the stored document later. Replacing either
    // defensive copy in summarize.ts with a direct reference leaves every other test green.
    const doc = base();
    doc.hitPoints = { current: 38, total: 45, temporary: 5 };
    doc.classes = { Rogue: { name: 'Rogue', level: 5 } };
    const before = JSON.stringify(doc);

    const summary = summarize(doc);
    summary.hitPoints.current = 1;
    summary.hitPoints.total = 2;
    summary.hitPoints.temporary = 3;
    summary.classes[0]!.name = 'Bard';
    summary.classes[0]!.level = 99;
    summary.classes.push({ name: 'Cleric', level: 1 });
    summary.name = 'Someone Else';
    summary.id = 'not-a-uuid';

    expect(JSON.stringify(doc)).toBe(before);
    expect(doc.hitPoints).toEqual({ current: 38, total: 45, temporary: 5 });
    expect(doc.classes).toEqual({ Rogue: { name: 'Rogue', level: 5 } });
  });
});
