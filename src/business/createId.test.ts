import { afterEach, describe, expect, it, vi } from 'vitest';
import { CURRENT_SCHEMA, createCharacter } from '../data/schema/index.js';
import { createId } from './createId.js';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('createId', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('produces a v4 uuid', () => {
    expect(createId()).toMatch(V4);
  });

  it('produces a different id each call', () => {
    expect(createId()).not.toBe(createId());
  });

  // crypto.randomUUID exists only in a secure context. Over plain HTTP — a phone hitting
  // http://192.168.x.x:5173 on the LAN, which is how a mobile-first PWA actually gets tested —
  // it is undefined. crypto.getRandomValues has no such restriction, so the fallback uses it.
  it('still produces a v4 uuid when randomUUID is unavailable, as on a non-secure origin', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('not available');
    });
    expect(createId()).toMatch(V4);
  });

  it('sets the version and variant bits itself in the fallback, rather than trusting raw bytes', () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('not available');
    });
    vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
      array.fill(0xff);
      return array;
    }) as typeof crypto.getRandomValues);

    const id = createId();
    expect(id).toMatch(V4);
    expect(id[14]).toBe('4');
    expect(id[19]).toBe('b');
  });

  it('produces an id the document schema accepts, in both paths', () => {
    const accepted = (id: string) =>
      CURRENT_SCHEMA.safeParse({ ...createCharacter({ name: 'X', id, now: new Date() }) }).success;

    expect(accepted(createId())).toBe(true);

    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new TypeError('not available');
    });
    expect(accepted(createId())).toBe(true);
  });
});
