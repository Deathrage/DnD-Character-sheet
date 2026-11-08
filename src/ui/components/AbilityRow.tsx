import { memo } from 'react';
import type { ABILITIES } from '../reference.js';
import type { AbilityKey } from '../types.js';
import { Mark } from './Mark.js';
import { NumberField } from './NumberField.js';

export interface AbilityRowActions {
  setAbilityScore(key: AbilityKey, value: number): void;
  setAbilityModifier(key: AbilityKey, value: number): void;
  setSavingThrowModifier(key: AbilityKey, value: number): void;
  setSavingThrowProficient?(key: AbilityKey, value: boolean): void;
}

interface Props {
  ability: (typeof ABILITIES)[number];
  value: {
    score: number;
    modifier: number;
    savingThrowModifier: number;
    /** Absent for a creature with no P mark: the Save box then sits in the grid like the others. */
    savingThrowProficient?: boolean;
  };
  actions: AbilityRowActions;
  /** Starts every accessible name: `Vestige` gives `Vestige STR score`. */
  labelPrefix?: string;
}

/**
 * One row each, memoised: a keystroke in one score leaves every other row's `value` the same
 * object (`bind.ts` keeps it), so the other rows skip their render.
 */
export const AbilityRow = memo(function AbilityRow({
  ability,
  value,
  actions,
  labelPrefix,
}: Props) {
  const short = labelPrefix === undefined ? ability.short : `${labelPrefix} ${ability.short}`;
  const save = (
    <NumberField
      label={`${short} saving throw`}
      value={value.savingThrowModifier}
      onChange={(next) => actions.setSavingThrowModifier(ability.key, next)}
      signed
    />
  );

  return (
    <div className={value.savingThrowProficient === undefined ? 'abrow nomark' : 'abrow'}>
      <span className="an">{ability.short}</span>
      <NumberField
        label={`${short} score`}
        value={value.score}
        onChange={(next) => actions.setAbilityScore(ability.key, next)}
      />
      <NumberField
        label={`${short} modifier`}
        value={value.modifier}
        onChange={(next) => actions.setAbilityModifier(ability.key, next)}
        signed
      />
      {value.savingThrowProficient === undefined ? (
        save
      ) : (
        <div className="savecell">
          <Mark
            label={`${short} saving throw proficiency`}
            letter="P"
            on={value.savingThrowProficient}
            onChange={(next) => actions.setSavingThrowProficient?.(ability.key, next)}
          />
          {save}
        </div>
      )}
    </div>
  );
});
