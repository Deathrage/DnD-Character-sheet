import { describe, expect, it } from 'vitest';
import { StorageGate, type PersistencePort } from './storageGate.js';

function port(overrides: Partial<PersistencePort> = {}): PersistencePort {
  return {
    persisted: () => Promise.resolve(false),
    persist: () => Promise.resolve(false),
    ...overrides,
  };
}

describe('StorageGate', () => {
  it('starts unknown and stays unknown when nothing has been granted yet', async () => {
    const storage = new StorageGate({ port: port() });
    expect(storage.persistence).toBe('unknown');

    await storage.load();

    // Not `denied`: nothing has been refused, because nothing has been asked. The gate's two
    // phases turn on exactly this distinction.
    expect(storage.persistence).toBe('unknown');
  });

  it('reports an existing grant without asking for one', async () => {
    let asked = false;
    const storage = new StorageGate({
      port: port({
        persisted: () => Promise.resolve(true),
        persist: () => {
          asked = true;
          return Promise.resolve(true);
        },
      }),
    });

    await storage.load();

    expect(storage.persistence).toBe('granted');
    // `persist()` prompts in some engines, so launch must never call it.
    expect(asked).toBe(false);
  });

  it('moves to granted or denied on the answer to a request', async () => {
    const granted = new StorageGate({ port: port({ persist: () => Promise.resolve(true) }) });
    await granted.requestPersist();
    expect(granted.persistence).toBe('granted');

    const denied = new StorageGate({ port: port({ persist: () => Promise.resolve(false) }) });
    await denied.requestPersist();
    expect(denied.persistence).toBe('denied');
  });

  it('counts a missing Storage API as denied rather than throwing', async () => {
    const storage = new StorageGate({ port: null });
    await storage.load();
    expect(storage.persistence).toBe('unknown');

    await storage.requestPersist();

    // Private browsing and older engines land here. The gate must still offer its escape.
    expect(storage.persistence).toBe('denied');
  });

  it('dismisses for the session, but never downgrades a grant', async () => {
    const denied = new StorageGate({ port: port() });
    await denied.requestPersist();
    denied.dismissForSession();
    expect(denied.persistence).toBe('dismissedForSession');

    const granted = new StorageGate({ port: port({ persisted: () => Promise.resolve(true) }) });
    await granted.load();
    granted.dismissForSession();
    expect(granted.persistence).toBe('granted');
  });

  it('reads usage when the engine estimates it, and null when it does not', async () => {
    const withEstimate = new StorageGate({
      port: port({ estimate: () => Promise.resolve({ usage: 1024, quota: 8192 }) }),
    });
    await withEstimate.load();
    expect(withEstimate.usage).toEqual({ usage: 1024, quota: 8192 });

    // Safari has shipped persisted()/persist() with no estimate() at all.
    const without = new StorageGate({ port: port() });
    await without.load();
    expect(without.usage).toBeNull();

    // And an estimate that answers with neither number is not half an answer.
    const partial = new StorageGate({ port: port({ estimate: () => Promise.resolve({}) }) });
    await partial.load();
    expect(partial.usage).toBeNull();
  });

  it('holds the last failure until it is cleared', () => {
    const storage = new StorageGate({ port: port() });
    expect(storage.failure).toBeNull();

    storage.report({ code: 'QUOTA_EXCEEDED' });
    expect(storage.failure).toEqual({ code: 'QUOTA_EXCEEDED' });

    storage.clearFailure();
    expect(storage.failure).toBeNull();
  });
});
