import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StorageError } from '../data/repository/storageFailure.js';
import type { CharacterRepository } from '../data/repository/types.js';
import type { CharacterDocument } from '../data/schema/index.js';
import { Autosave } from './autosave.js';
import { createCharacterSheet } from './characterSheet.js';

const CREATED_AT = new Date('2026-07-25T09:41:00.000Z');
const SAVED_AT = new Date('2026-09-22T17:00:00.000Z');

/**
 * Only `save` is exercised, and it records rather than stores: what is under test is when
 * `Autosave` calls the repository and with what, not what IndexedDB then does with it. The real
 * repository's own tests cover that, and a fake keeps the debounce assertions free of a database
 * round trip inside the fake-timer window.
 */
function stubRepository(): CharacterRepository & {
  saved: CharacterDocument[];
  fail: Error | undefined;
} {
  const stub = {
    saved: [] as CharacterDocument[],
    fail: undefined as Error | undefined,
    save(doc: CharacterDocument) {
      stub.saved.push(doc);
      return stub.fail ? Promise.reject(stub.fail) : Promise.resolve();
    },
    list: () => Promise.resolve([]),
    get: () => Promise.resolve(null),
    getRaw: () => Promise.resolve(undefined),
    delete: () => Promise.resolve(),
  };
  return stub;
}

const newSheet = () => createCharacterSheet('Sable', CREATED_AT);

describe('Autosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces a burst of edits into one save of the final state', async () => {
    const sheet = newSheet();
    const repository = stubRepository();
    const autosave = new Autosave(sheet, repository, { debounceMs: 500, now: () => SAVED_AT });
    autosave.start();

    for (let value = 1; value <= 20; value++) sheet.hitPoints.setCurrent(value);
    expect(repository.saved).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(500);

    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]?.hitPoints.current).toBe(20);
    autosave.stop();
  });

  it('saves again for an edit made after the window closed', async () => {
    const sheet = newSheet();
    const repository = stubRepository();
    const autosave = new Autosave(sheet, repository, { debounceMs: 500, now: () => SAVED_AT });
    autosave.start();

    sheet.hitPoints.setCurrent(1);
    await vi.advanceTimersByTimeAsync(500);
    sheet.hitPoints.setCurrent(2);
    await vi.advanceTimersByTimeAsync(500);

    expect(repository.saved.map((doc) => doc.hitPoints.current)).toEqual([1, 2]);
    autosave.stop();
  });

  it('stamps updatedAt on the copy and never writes it back to the document', async () => {
    const sheet = newSheet();
    const repository = stubRepository();
    const autosave = new Autosave(sheet, repository, { debounceMs: 500, now: () => SAVED_AT });
    autosave.start();

    sheet.hitPoints.setCurrent(1);
    await vi.advanceTimersByTimeAsync(500);

    expect(repository.saved[0]?.updatedAt).toBe(SAVED_AT.toISOString());
    // The observable document keeps the stamp it was created with. Writing the new one back
    // would retrigger the reaction that just fired, and the save loop would never settle.
    expect(sheet.toDocument().updatedAt).toBe(CREATED_AT.toISOString());
    expect(repository.saved).toHaveLength(1);

    // Belt and braces: let any retriggered window elapse and confirm nothing else was written.
    await vi.advanceTimersByTimeAsync(5_000);
    expect(repository.saved).toHaveLength(1);
    autosave.stop();
  });

  it('does not save when nothing has changed', async () => {
    const sheet = newSheet();
    const repository = stubRepository();
    const autosave = new Autosave(sheet, repository, { debounceMs: 500, now: () => SAVED_AT });
    autosave.start();

    await vi.advanceTimersByTimeAsync(5_000);
    await autosave.flush();

    expect(repository.saved).toEqual([]);
    autosave.stop();
  });

  it('flush writes pending work immediately, without waiting out the window', async () => {
    const sheet = newSheet();
    const repository = stubRepository();
    const autosave = new Autosave(sheet, repository, { debounceMs: 500, now: () => SAVED_AT });
    autosave.start();

    sheet.hitPoints.setCurrent(7);
    await autosave.flush();

    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]?.hitPoints.current).toBe(7);

    // The window that was already running must not produce a second write of the same state.
    await vi.advanceTimersByTimeAsync(500);
    expect(repository.saved).toHaveLength(1);
    autosave.stop();
  });

  it('flushes on pagehide and on a visibility change to hidden', async () => {
    const target = new EventTarget();
    const sheet = newSheet();
    const repository = stubRepository();
    const autosave = new Autosave(sheet, repository, {
      debounceMs: 500,
      now: () => SAVED_AT,
      target,
    });
    autosave.start();

    sheet.hitPoints.setCurrent(3);
    target.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.saved.map((doc) => doc.hitPoints.current)).toEqual([3]);

    sheet.hitPoints.setCurrent(4);
    target.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(repository.saved.map((doc) => doc.hitPoints.current)).toEqual([3, 4]);

    autosave.stop();
  });

  it('stop detaches the listeners and the reaction', async () => {
    const target = new EventTarget();
    const sheet = newSheet();
    const repository = stubRepository();
    const autosave = new Autosave(sheet, repository, {
      debounceMs: 500,
      now: () => SAVED_AT,
      target,
    });
    autosave.start();
    autosave.stop();

    sheet.hitPoints.setCurrent(5);
    target.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(5_000);

    expect(repository.saved).toEqual([]);
  });

  it('stop writes an edit the window had not yet reached', async () => {
    const sheet = newSheet();
    const repository = stubRepository();
    const autosave = new Autosave(sheet, repository, { debounceMs: 500, now: () => SAVED_AT });
    autosave.start();

    sheet.hitPoints.setCurrent(9);
    // Mid-window: the debounce has not elapsed, so nothing is written yet.
    expect(repository.saved).toEqual([]);
    autosave.stop();
    await vi.advanceTimersByTimeAsync(0);

    // Closing a sheet must not cost the player the last half second of typing.
    expect(repository.saved.map((doc) => doc.hitPoints.current)).toEqual([9]);
  });

  it('reports a refused save and does not retry it', async () => {
    const sheet = newSheet();
    const repository = stubRepository();
    repository.fail = new StorageError({
      code: 'SAVE_REFUSED',
      issues: [{ path: 'name', message: 'Too long' }],
    });
    const failures: unknown[] = [];
    const autosave = new Autosave(sheet, repository, {
      debounceMs: 500,
      now: () => SAVED_AT,
      onFailure: (failure) => failures.push(failure),
    });
    autosave.start();

    sheet.hitPoints.setCurrent(1);
    await vi.advanceTimersByTimeAsync(500);

    expect(failures).toEqual([
      { code: 'SAVE_REFUSED', issues: [{ path: 'name', message: 'Too long' }] },
    ]);
    // One attempt. A refused document is refused for a reason that will not change on its own,
    // and a retry loop would hammer the repository with the same invalid write forever.
    expect(repository.saved).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(repository.saved).toHaveLength(1);
    autosave.stop();
  });

  it('reports a failure that is not a StorageError as UNKNOWN', async () => {
    const sheet = newSheet();
    const repository = stubRepository();
    repository.fail = new Error('disk on fire');
    const failures: { code: string }[] = [];
    const autosave = new Autosave(sheet, repository, {
      debounceMs: 500,
      now: () => SAVED_AT,
      onFailure: (failure) => failures.push(failure),
    });
    autosave.start();

    sheet.hitPoints.setCurrent(1);
    await vi.advanceTimersByTimeAsync(500);

    expect(failures.map((failure) => failure.code)).toEqual(['UNKNOWN']);
    autosave.stop();
  });
});
