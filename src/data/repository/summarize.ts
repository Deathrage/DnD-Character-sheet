import type { CharacterDocument } from '../schema/index.js';
import type { CharacterSummary } from './types.js';

/** The portrait is a parameter because it is not in the document: it lives in its own store. */
export function summarize(doc: CharacterDocument, portrait: string | null): CharacterSummary {
  const classes = doc.classes.map(({ name, level }) => ({ name, level }));

  return {
    id: doc.id,
    name: doc.name,
    totalLevel: classes.reduce((total, entry) => total + entry.level, 0),
    classes,
    hitPoints: { ...doc.hitPoints },
    portrait,
  };
}
