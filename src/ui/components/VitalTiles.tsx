import type { ReactNode } from 'react';
import type { HitDieView } from '../types.js';
import { NumberField } from './NumberField.js';

export interface TileActions {
  setCurrentHitPoints(value: number): void;
  setTotalHitPoints(value: number): void;
  setTemporaryHitPoints(value: number): void;
  setArmorClass(value: number): void;
  setInitiative(value: number): void;
}

interface Props {
  /** Starts every accessible name: `Vestige` gives `Vestige current hit points`. */
  labelPrefix?: string;
  hitPoints: { current: number; total: number; temporary: number };
  /** `null` is switched off: a tile that says so, with nothing to press. */
  hitDices: readonly HitDieView[] | null;
  armorClass: number;
  /** `null` uses the character's initiative: a tile that says so, with no input. */
  initiative: number | null;
  actions: TileActions;
  onOpenHitDice(): void;
  /** Rendered inside the hit points tile, after Temp: the header's death saves. */
  children?: ReactNode;
}

/**
 * The HP / hit dice / AC / initiative tiles, shared by the vitals header and every companion.
 * A companion's tiles carry its name in every label, or two open companions and the pinned header
 * would give a screen reader several fields called "Current hit points".
 */
export function VitalTiles({
  labelPrefix,
  hitPoints,
  hitDices,
  armorClass,
  initiative,
  actions,
  onOpenHitDice,
  children,
}: Props) {
  const label = (name: string) =>
    labelPrefix === undefined
      ? name.charAt(0).toUpperCase() + name.slice(1)
      : `${labelPrefix} ${name}`;

  return (
    <div className="tiles">
      <div className="tile hp">
        <div>
          <div className="tl">Hit Points</div>
          <div className="hpwrap">
            {/* Steppers go on the numbers that move during a fight — current HP and temp —
                and not on max HP or AC, which are set once a level and would only lose the
                row the width. */}
            <NumberField
              label={label('current hit points')}
              value={hitPoints.current}
              onChange={actions.setCurrentHitPoints}
              stepper
            />
            <span className="slash">/</span>
            <NumberField
              label={label('total hit points')}
              value={hitPoints.total}
              onChange={actions.setTotalHitPoints}
            />
          </div>
        </div>
        <div className="tempbox">
          <div className="tl">Temp</div>
          <NumberField
            label={label('temporary hit points')}
            value={hitPoints.temporary}
            onChange={actions.setTemporaryHitPoints}
            stepper
          />
        </div>
        {children}
      </div>

      {hitDices === null ? (
        <div className="tile">
          <div className="tl">Hit Dices</div>
          <span className="tval off">No hit dices</span>
        </div>
      ) : (
        <button
          type="button"
          className="tile btn"
          // A button that shows a value keeps it in its name, with the companion's name first.
          aria-label={
            labelPrefix === undefined
              ? undefined
              : `${labelPrefix} Hit Dices ${summariseHitDice(hitDices)}`
          }
          onClick={onOpenHitDice}
        >
          <span className="tl">Hit Dices</span>
          <span className="tval hdtile">{summariseHitDice(hitDices)}</span>
        </button>
      )}

      <div className="tile ac">
        {/* "AC", not "Armor Class": at a quarter of the row the long form wraps. */}
        <div className="tl">AC</div>
        <NumberField
          label={label('armor class')}
          value={armorClass}
          onChange={actions.setArmorClass}
        />
      </div>

      {/* Rolled at the start of every fight, so it sits with AC rather than behind a tap.
          Signed: it is a modifier. Stored beside armor class and, like it, edited only here.
          It took speed's tile; speed is edited on Abilities & Skills only. */}
      <div className="tile">
        <div className="tl">Initiative</div>
        {initiative === null ? (
          <span className="tval off">Uses yours</span>
        ) : (
          <NumberField
            label={label('initiative')}
            value={initiative}
            onChange={actions.setInitiative}
            signed
          />
        )}
      </div>
    </div>
  );
}

export function summariseHitDice(dice: readonly HitDieView[]): string {
  if (dice.length === 0) return 'Tap to set up';
  // A no-break space inside each die, so a narrow tile wraps between dice and never splits one.
  return dice.map((die) => `${die.current}/${die.total}\u00a0d${die.size}`).join(' · ');
}
