import { describe, expect, it } from 'vitest';
import type { LogEntry } from './entries.js';
import { createLogStore, MAX_ENTRIES } from './logStore.js';

/** A database per test: fake-indexeddb keeps them for the whole file. */
let databases = 0;
const fresh = (cap?: number) => freshNamed(`diagnostics-test-${++databases}`, cap);
const freshNamed = (name: string, cap?: number) =>
  createLogStore({ name, ...(cap === undefined ? {} : { cap }) });
const exists = async (name: string) =>
  (await indexedDB.databases()).some((info) => info.name === name);

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

  it('never creates its database on a read or a clear; only a write does', async () => {
    const name = `diagnostics-test-${++databases}`;
    const store = freshNamed(name);
    expect(await store.count()).toBe(0);
    expect(await store.oldest()).toBeNull();
    expect(await store.readAll()).toEqual([]);
    await store.clear();
    expect(await exists(name)).toBe(false);

    await store.append([entry(1)]);
    expect(await exists(name)).toBe(true);
    expect(await store.count()).toBe(1);
  });

  it('reads a database another store instance created', async () => {
    const name = `diagnostics-test-${++databases}`;
    await freshNamed(name).append([entry(7)]);
    expect((await freshNamed(name).readAll()).map((kept) => kept.t)).toEqual([7]);
  });
});
