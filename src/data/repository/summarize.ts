import type { CharacterDocument } from '../schema/index.js';
import type { CharacterSummary } from './types.js';

export function summarize(doc: CharacterDocument): CharacterSummary {
  const classes = Object.values(doc.classes).map(({ name, level }) => ({ name, level }));

  return {
    id: doc.id,
    name: doc.name,
    totalLevel: classes.reduce((total, entry) => total + entry.level, 0),
    classes,
    hitPoints: { ...doc.hitPoints },
  };
}
