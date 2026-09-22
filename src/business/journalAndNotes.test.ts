import { describe, expect, it } from 'vitest';
import { createCharacter } from '../data/schema/index.js';
import { CharacterSheetBO } from './characterSheet.js';

const sheetFor = () =>
  new CharacterSheetBO(
    createCharacter({
      name: 'Sable',
      id: '3f1a6c2e-8b4d-4a19-9c7e-1d2b3a4c5d6e',
      now: new Date('2026-07-25T09:41:00.000Z'),
    }),
  );

describe('JournalAndNotesBO', () => {
  it('starts with no days and empty notes', () => {
    const { journalAndNotes } = sheetFor();
    expect(journalAndNotes.days).toEqual([]);
    expect(journalAndNotes.notes).toBe('');
  });

  it('reads and writes notes', () => {
    const { journalAndNotes } = sheetFor();
    journalAndNotes.setNotes('Find the Sunsword.');
    expect(journalAndNotes.notes).toBe('Find the Sunsword.');
  });

  // Freeform prose, unlike a name: leading whitespace may be deliberate, and the schema's
  // longText does not reject padding.
  it('does not trim notes, because leading whitespace may be deliberate', () => {
    const { journalAndNotes } = sheetFor();
    journalAndNotes.setNotes('  indented  ');
    expect(journalAndNotes.notes).toBe('  indented  ');
  });

  it('appends a day at the end only', () => {
    const { journalAndNotes } = sheetFor();
    journalAndNotes.appendDay('Arrived in Barovia.');
    journalAndNotes.appendDay('Met the burgomaster.');

    expect(journalAndNotes.days.map((day) => day.text)).toEqual([
      'Arrived in Barovia.',
      'Met the burgomaster.',
    ]);
  });

  // Ties dayIndex to actual position (not just to array length): appendDay('a') then
  // appendDay('b') must put 'a' at index 0 and 'b' at index 1. A plain `second.dayIndex === 1`
  // check does not discriminate an append-at-the-front bug, because the returned index is always
  // `length - 1` regardless of where the push landed; asserting content at each index does.
  it('numbers days by position, because the index IS the day index', () => {
    const { journalAndNotes } = sheetFor();
    const first = journalAndNotes.appendDay('a');
    const second = journalAndNotes.appendDay('b');

    expect(first.dayIndex).toBe(0);
    expect(second.dayIndex).toBe(1);
    expect(journalAndNotes.days[0]?.text).toBe('a');
    expect(journalAndNotes.days[1]?.text).toBe('b');
  });

  it('appends an empty day when no text is given', () => {
    expect(sheetFor().journalAndNotes.appendDay().text).toBe('');
  });

  it('edits a day in place', () => {
    const { journalAndNotes } = sheetFor();
    const day = journalAndNotes.appendDay('Arrived.');
    day.setText('Arrived in Barovia.');

    expect(journalAndNotes.days[0]?.text).toBe('Arrived in Barovia.');
  });

  it('deletes the newest day only', () => {
    const { journalAndNotes } = sheetFor();
    journalAndNotes.appendDay('one');
    journalAndNotes.appendDay('two');

    journalAndNotes.deleteNewestDay();

    expect(journalAndNotes.days.map((day) => day.text)).toEqual(['one']);
  });

  it('throws GONE when deleting from an empty journal', () => {
    expect(() => sheetFor().journalAndNotes.deleteNewestDay()).toThrow(
      expect.objectContaining({ code: 'GONE' }) as Error,
    );
  });

  // There is deliberately no way to delete or insert at an arbitrary index. Model.ts states the
  // rule: the business layer may only append at the end and delete the newest.
  it('exposes no way to remove a day other than the newest', () => {
    const { journalAndNotes } = sheetFor();
    journalAndNotes.appendDay('one');
    const day = journalAndNotes.days[0];

    expect(day).toBeDefined();
    expect(day).not.toHaveProperty('remove');
  });

  it('writes through to the saved document', () => {
    const sheet = sheetFor();
    sheet.journalAndNotes.appendDay('one');
    sheet.journalAndNotes.setNotes('notes');

    expect(sheet.toDocument().journalAndNotes).toEqual({ journal: ['one'], notes: 'notes' });
  });

  // Beyond the brief: a write made THROUGH the object appendDay() returned must reach
  // toDocument(). An earlier task shipped a bug where the returned object was detached from the
  // document while every existing test still passed.
  it('writes made through the day appendDay() returned reach the saved document', () => {
    const sheet = sheetFor();
    const day = sheet.journalAndNotes.appendDay('one');
    day.setText('Arrived in Barovia.');

    expect(sheet.toDocument().journalAndNotes.journal).toEqual(['Arrived in Barovia.']);
  });
});
