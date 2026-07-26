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
