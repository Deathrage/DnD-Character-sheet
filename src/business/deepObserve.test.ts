import { observable } from 'mobx';
import { describe, expect, it, vi } from 'vitest';
import { CharacterSheetBO } from './characterSheet.js';
import { createCharacter } from '../data/schema/index.js';
import { deepObserve } from './deepObserve.js';

type Item = { id: string; name: string; attack: { bonus: number } | null };

/** A toy tree with every shape `observable(doc)` makes: objects, arrays, a record, primitives. */
const treeFor = () =>
  observable({
    name: 'Sable',
    hitPoints: { current: 10, total: 10 },
    weapons: [{ id: 'w1', name: 'Rapier', attack: null }] as Item[],
    dice: { 8: { current: 1, total: 1 } } as Record<string, { current: number; total: number }>,
    journal: ['Day one'],
  });

describe('deepObserve', () => {
  it('fires once per change, at any depth', () => {
    const doc = treeFor();
    const listener = vi.fn();
    deepObserve(doc, listener);

    doc.name = 'Sable Nightwind';
    doc.hitPoints.current = 7;
    doc.journal[0] = 'Day one, revised';
    doc.journal.push('Day two');

    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('observes an item that is pushed, and inside it afterwards', () => {
    const doc = treeFor();
    const listener = vi.fn();
    deepObserve(doc, listener);

    doc.weapons.push({ id: 'w2', name: 'Dagger', attack: { bonus: 1 } });
    listener.mockClear();
    // MobX stores an observable copy; the change must be seen through what is in the array.
    doc.weapons[1]!.attack!.bonus = 2;

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('observes a subtree that replaces another, and releases the one replaced', () => {
    const doc = treeFor();
    const listener = vi.fn();
    deepObserve(doc, listener);

    const rapier = doc.weapons[0]!;
    rapier.attack = { bonus: 3 };
    const first = rapier.attack;
    rapier.attack = { bonus: 4 };
    const second = rapier.attack;
    listener.mockClear();

    first.bonus = 99;
    expect(listener).not.toHaveBeenCalled();
    second.bonus = 5;
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('releases an item that is spliced out', () => {
    const doc = treeFor();
    const listener = vi.fn();
    deepObserve(doc, listener);

    const [gone] = doc.weapons.splice(0, 1);
    listener.mockClear();

    gone!.name = 'Still held by a stale business object';
    expect(listener).not.toHaveBeenCalled();
  });

  it('fires for a key added to a record and for one deleted from it', () => {
    const doc = treeFor();
    const listener = vi.fn();
    deepObserve(doc, listener);

    doc.dice[10] = { current: 2, total: 2 };
    expect(listener).toHaveBeenCalledTimes(1);
    doc.dice[10]!.current = 1;
    expect(listener).toHaveBeenCalledTimes(2);
    delete doc.dice[10];
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('keeps observing a node while any parent still holds it', () => {
    const doc = observable({
      a: [{ id: 'x', name: 'Shared' }],
      b: [] as { id: string; name: string }[],
    });
    const listener = vi.fn();
    deepObserve(doc, listener);

    // Reachable from two parents, then from one, then from none — the order `CategoryBO.remove`
    // uses: push into the new home first, splice out of the old one second.
    doc.b.push(doc.a[0]!);
    doc.a.splice(0, 1);
    listener.mockClear();
    doc.b[0]!.name = 'Still shared';
    expect(listener).toHaveBeenCalledTimes(1);

    const [gone] = doc.b.splice(0, 1);
    listener.mockClear();
    gone!.name = 'Nowhere';
    expect(listener).not.toHaveBeenCalled();
  });

  it('stops entirely once disposed', () => {
    const doc = treeFor();
    const listener = vi.fn();
    const dispose = deepObserve(doc, listener);

    dispose();
    doc.name = 'Nobody';
    doc.hitPoints.current = 0;
    doc.weapons.push({ id: 'w3', name: 'Club', attack: null });

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('CharacterSheetBO.observe', () => {
  it('still reports an edit to a feat after its category was removed', () => {
    const sheet = new CharacterSheetBO(
      createCharacter({
        name: 'Sable',
        id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
        now: new Date('2026-07-25T09:41:00.000Z'),
      }),
    );
    const category = sheet.featsAndTraits.createCategory('Rogue');
    category.add({ name: 'Sneak Attack' });
    const listener = vi.fn();
    sheet.observe(listener);

    // Removing a category rehomes its feats into Uncategorized. With the observer gone from
    // them, this rename would show on screen and never reach autosave.
    category.remove();
    listener.mockClear();
    sheet.featsAndTraits.uncategorized[0]?.setName('Sneak Attack (2d6)');

    expect(listener).toHaveBeenCalledTimes(1);
    expect(sheet.toDocument().featsAndTraits.uncategorized[0]?.name).toBe('Sneak Attack (2d6)');
  });
});
