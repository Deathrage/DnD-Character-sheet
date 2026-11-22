import { describe, expect, it } from 'vitest';
import type { LogEntry } from './entries.js';
import { createLogStore, MAX_ENTRIES } from './logStore.js';

/** A database per test: fake-indexeddb keeps them for the whole file. */
let databases = 0;
const fresh = (cap?: number) =>
  createLogStore({
    name: `diagnostics-test-${++databases}`,
    ...(cap === undefined ? {} : { cap }),
  });

const entry = (t: number): LogEntry => ({
  kind: 'lifecycle',
  event: 'resume',
  at: new Date(t).toISOString(),
  t,
});

describe('createLogStore', () => {
  it('reads entries back oldest first, across appends', async () => {
    const store = fresh();
    await store.append([entry(1), entry(2)]);
    await store.append([entry(3)]);
    expect((await store.readAll()).map((kept) => kept.t)).toEqual([1, 2, 3]);
  });

  it('keeps only the newest entries past the cap', async () => {
    const store = fresh(3);
    await store.append([entry(1), entry(2)]);
    await store.append([entry(3), entry(4), entry(5)]);
    expect((await store.readAll()).map((kept) => kept.t)).toEqual([3, 4, 5]);
    expect(await store.count()).toBe(3);
  });

  it('caps at 2,000 entries unless told otherwise', () => {
    expect(MAX_ENTRIES).toBe(2000);
  });

  it('names the oldest entry, or none', async () => {
    const store = fresh();
    expect(await store.oldest()).toBeNull();
    await store.append([entry(1), entry(2)]);
    expect((await store.oldest())?.t).toBe(1);
  });

  it('clears', async () => {
    const store = fresh();
    await store.append([entry(1)]);
    await store.clear();
    expect(await store.count()).toBe(0);
    expect(await store.readAll()).toEqual([]);
  });
});
