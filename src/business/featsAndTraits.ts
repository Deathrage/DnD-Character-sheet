import { CategorizedBO, CategorizedItemBO, type NewNamedItem } from './categorized.js';
import { createId } from './createId.js';
import { longText, trimmedName } from './guards.js';
import type { FeatData, FeatsAndTraitsData } from './types.js';

export class FeatBO extends CategorizedItemBO<FeatData> {}

export const featFill = ({ name, description = '' }: NewNamedItem): FeatData => ({
  id: createId(),
  name: trimmedName(name),
  description: longText(description),
});

export type FeatsAndTraitsBO = CategorizedBO<FeatData, FeatBO>;

export const makeFeatsAndTraits = (node: FeatsAndTraitsData): FeatsAndTraitsBO =>
  new CategorizedBO<FeatData, FeatBO>(
    node,
    (item, siblings, owner) => new FeatBO(item, siblings, owner),
    featFill,
  );
