import { describe, expect, it } from 'vitest';
import { ID_A, ID_B, docFor } from '../../test/fixtures.js';
import { toJsonText } from './exportCharacter.js';
import { fromJsonText } from './importCharacter.js';

const exported = () => toJsonText(docFor(ID_A, 'Sable Nightwind'));

describe('fromJsonText', () => {
  it('reads a document this app exported', () => {
    const result = fromJsonText(exported(), { assignId: ID_B });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.name).toBe('Sable Nightwind');
  });

  it('always assigns the new id, so import can never overwrite a character', () => {
    const result = fromJsonText(exported(), { assignId: ID_B });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.doc.id).toBe(ID_B);
  });

  it('preserves everything except the id', () => {
    const result = fromJsonText(exported(), { assignId: ID_B });
    expect(result.ok).toBe(true);
    if (result.ok) {
      const original = JSON.parse(exported()) as Record<string, unknown>;
      expect({ ...result.doc, id: ID_A }).toEqual(original);
    }
  });

  it('reports a syntax failure separately from a schema failure', () => {
    const result = fromJsonText('{ "schemaVersion": 1, ', { assignId: ID_B });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('syntax');
  });

  it('includes the parser message so the editor can point at the problem', () => {
    const result = fromJsonText('nonsense', { assignId: ID_B });
    expect(result.ok).toBe(false);
    if (!result.ok && result.kind === 'syntax') {
      expect(result.message.length).toBeGreaterThan(0);
    } else {
      throw new Error('expected a syntax failure');
    }
  });

  it('reports a document failure for well-formed JSON that is not a character', () => {
    const result = fromJsonText('{"schemaVersion": 1}', { assignId: ID_B });
    expect(result.ok).toBe(false);
    if (!result.ok && result.kind === 'document') {
      expect(result.error.code).toBe('INVALID_AT_VERSION');
      expect(result.raw).toEqual({ schemaVersion: 1 });
    } else {
      throw new Error('expected a document failure');
    }
  });

  it('treats an empty file as a syntax failure, not an empty character', () => {
    const result = fromJsonText('', { assignId: ID_B });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.kind).toBe('syntax');
  });
});
