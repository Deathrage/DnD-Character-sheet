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
    const storage = new StorageGate({ port: port(), session: null });
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
      session: null,
    });

    await storage.load();

    expect(storage.persistence).toBe('granted');
    // `persist()` prompts in some engines, so launch must never call it.
    expect(asked).toBe(false);
  });

  it('moves to granted or denied on the answer to a request', async () => {
    const granted = new StorageGate({
      port: port({ persist: () => Promise.resolve(true) }),
      session: null,
    });
    await granted.requestPersist();
    expect(granted.persistence).toBe('granted');

    const denied = new StorageGate({
      port: port({ persist: () => Promise.resolve(false) }),
      session: null,
    });
    await denied.requestPersist();
    expect(denied.persistence).toBe('denied');
  });

  it('counts a missing Storage API as denied rather than throwing', async () => {
    const storage = new StorageGate({ port: null, session: null });
    await storage.load();
    expect(storage.persistence).toBe('unknown');

    await storage.requestPersist();

    // Private browsing and older engines land here. The gate must still offer its escape.
    expect(storage.persistence).toBe('denied');
  });

  it('dismisses for the session, but never downgrades a grant', async () => {
    const denied = new StorageGate({ port: port(), session: null });
    await denied.requestPersist();
    denied.dismissForSession();
    expect(denied.persistence).toBe('dismissedForSession');

    const granted = new StorageGate({
      port: port({ persisted: () => Promise.resolve(true) }),
      session: null,
    });
    await granted.load();
    granted.dismissForSession();
    expect(granted.persistence).toBe('granted');
  });

  it('reads usage when the engine estimates it, and null when it does not', async () => {
    const withEstimate = new StorageGate({
      port: port({ estimate: () => Promise.resolve({ usage: 1024, quota: 8192 }) }),
      session: null,
    });
    await withEstimate.load();
    expect(withEstimate.usage).toEqual({ usage: 1024, quota: 8192 });

    // Safari has shipped persisted()/persist() with no estimate() at all.
    const without = new StorageGate({ port: port(), session: null });
    await without.load();
    expect(without.usage).toBeNull();

    // And an estimate that answers with neither number is not half an answer.
    const partial = new StorageGate({
      port: port({ estimate: () => Promise.resolve({}) }),
      session: null,
    });
    await partial.load();
    expect(partial.usage).toBeNull();
  });

  it('holds the last failure until it is cleared', () => {
    const storage = new StorageGate({ port: port(), session: null });
    expect(storage.failure).toBeNull();

    storage.report({ code: 'QUOTA_EXCEEDED' });
    expect(storage.failure).toEqual({ code: 'QUOTA_EXCEEDED' });

    storage.clearFailure();
    expect(storage.failure).toBeNull();
  });
});

describe('StorageGate resilience', () => {
  it('stays unknown when the browser throws on persisted(), instead of rejecting', async () => {
    const gate = new StorageGate({
      port: port({ persisted: () => Promise.reject(new Error('blocked')) }),
      session: null,
    });

    // The app awaits this before its first render. A rejection here left the screen on
    // "Loading…" permanently, which is how a storage-hostile browser used to look.
    await expect(gate.load()).resolves.toBeUndefined();
    expect(gate.persistence).toBe('unknown');
  });

  it('counts a throwing persist() as refused', async () => {
    const gate = new StorageGate({
      port: port({ persist: () => Promise.reject(new Error('SecurityError')) }),
      session: null,
    });

    await expect(gate.requestPersist()).resolves.toBeUndefined();
    // It was asked for and it was not granted, so the gate must move on to offering the escape
    // rather than sitting in `ask` waiting for an answer that already came back.
    expect(gate.persistence).toBe('denied');
  });

  it('survives a throwing estimate()', async () => {
    const gate = new StorageGate({
      port: port({ estimate: () => Promise.reject(new Error('nope')) }),
      session: null,
    });

    await expect(gate.load()).resolves.toBeUndefined();
    expect(gate.usage).toBeNull();
  });
});

describe('StorageGate session memory', () => {
  const fakeSession = (initial: Record<string, string> = {}) => {
    const store = new Map(Object.entries(initial));
    return {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      store,
    };
  };

  it('remembers a dismissal so a reload in the same tab is not re-gated', async () => {
    const session = fakeSession();
    const first = new StorageGate({ port: port(), session });
    await first.requestPersist();
    first.dismissForSession();

    // A reload is a fresh StorageGate over the same sessionStorage.
    const afterReload = new StorageGate({ port: port(), session });
    await afterReload.load();

    expect(afterReload.persistence).toBe('dismissedForSession');
  });

  it('asks again in a new tab, where sessionStorage is empty', async () => {
    const session = fakeSession();
    const dismissed = new StorageGate({ port: port(), session });
    dismissed.dismissForSession();

    // A new tab gets its own sessionStorage — criterion 14's "returns on the next launch".
    const newTab = new StorageGate({ port: port(), session: fakeSession() });
    await newTab.load();

    expect(newTab.persistence).toBe('unknown');
  });

  it('lets a later grant override a remembered dismissal', async () => {
    const session = fakeSession();
    new StorageGate({ port: port(), session }).dismissForSession();

    const granted = new StorageGate({
      port: port({ persisted: () => Promise.resolve(true) }),
      session,
    });
    await granted.load();

    expect(granted.persistence).toBe('granted');
  });

  it('works when sessionStorage itself throws', () => {
    const hostile = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };

    // Storage-partitioned and private contexts do exactly this, and this class exists to be
    // useful in them.
    const gate = new StorageGate({ port: port(), session: hostile });
    expect(gate.persistence).toBe('unknown');
    expect(() => {
      gate.dismissForSession();
    }).not.toThrow();
    expect(gate.persistence).toBe('dismissedForSession');
  });
});
