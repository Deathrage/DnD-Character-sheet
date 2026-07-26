import { describe, expect, it } from 'vitest';
import { createCharacter } from '../schema/index.js';
import { toJsonText } from './exportCharacter.js';
import { fromJsonText } from './importCharacter.js';

const ORIGINAL_ID = '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e';
const NEW_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const exported = () =>
  toJsonText(
    createCharacter({
      name: 'Sable Nightwind',
      id: ORIGINAL_ID,
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('fromJsonText', () => {
  it('reads a document this app exported', () => {
    const result = fromJsonText(exported(), { assignId: NEW_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.name).toBe('Sable Nightwind');
  });

  it('always assigns the new id, so import can never overwrite a character', () => {
    const result = fromJsonText(exported(), { assignId: NEW_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.id).toBe(NEW_ID);
  });

  it('preserves everything except the id', () => {
    const result = fromJsonText(exported(), { assignId: NEW_ID });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const original = JSON.parse(exported()) as Record<string, unknown>;
      expect({ ...result.doc, id: ORIGINAL_ID }).toEqual(original);
    }
  });

  it('reports a syntax failure separately from a schema failure', () => {
    const result = fromJsonText('{ "schemaVersion": 1, ', { assignId: NEW_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('syntax');
  });

  it('includes the parser message so the editor can point at the problem', () => {
    const result = fromJsonText('nonsense', { assignId: NEW_ID });
    expect(result.ok).toBe(false);
    if (!result.ok && result.kind === 'syntax') {
      expect(result.message.length).toBeGreaterThan(0);
    } else {
      throw new Error('expected a syntax failure');
    }
  });

  it('reports a document failure for well-formed JSON that is not a character', () => {
    const result = fromJsonText('{"schemaVersion": 1}', { assignId: NEW_ID });
    expect(result.ok).toBe(false);
    if (!result.ok && result.kind === 'document') {
      expect(result.error.code).toBe('INVALID_AT_VERSION');
      expect(result.raw).toEqual({ schemaVersion: 1 });
    } else {
      throw new Error('expected a document failure');
    }
  });

  it('treats an empty file as a syntax failure, not an empty character', () => {
    const result = fromJsonText('', { assignId: NEW_ID });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('syntax');
  });
});
