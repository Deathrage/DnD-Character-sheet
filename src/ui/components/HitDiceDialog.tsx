import type { HitDieView, NameResult } from '../types.js';
import { AddByName } from './AddByName.js';
import { ConfirmDelete } from './ConfirmDelete.js';
import { NumberField } from './NumberField.js';
import { ResponsiveDialog } from './ResponsiveDialog.js';

export interface HitDieActions {
  addHitDie(size: number): NameResult;
  setHitDieCurrent(size: number, value: number): void;
  setHitDieTotal(size: number, value: number): void;
  removeHitDie(size: number): void;
}

interface Props {
  open: boolean;
  onClose(): void;
  /** `Vestige: Hit Dices` for a companion, whose tile sits under the character's own. */
  title?: string;
  dice: readonly HitDieView[];
  actions: HitDieActions;
}

export function HitDiceDialog({ open, onClose, title = 'Hit Dices', dice, actions }: Props) {
  return (
    <ResponsiveDialog title={title} open={open} onClose={onClose}>
      <div className="hint" style={{ marginTop: 0 }}>
        Set up each die type with its total and current count.
      </div>
      {dice.length === 0 && <div className="empty">No hit dices yet.</div>}
      {dice.map((die) => (
        <div className="hdrow" key={die.size}>
          {/* The die size is the key of the stored record, so it is displayed, not edited:
              changing it would be a delete plus an add, which the two buttons already do. */}
          <span className="dtype">d{die.size}</span>
          <span className="lab">Cur</span>
          {/* Spending and regaining hit dice on a rest is the other repeated tap. The total
              beside it is a property of the character, not something you tick. */}
          <NumberField
            label={`Current d${die.size}`}
            className="curinp"
            value={die.current}
            onChange={(value) => actions.setHitDieCurrent(die.size, value)}
            stepper
          />
          <span className="lab">Total</span>
          <NumberField
            label={`Total d${die.size}`}
            className="curinp total"
            value={die.total}
            onChange={(value) => actions.setHitDieTotal(die.size, value)}
          />
          <ConfirmDelete
            className="delx"
            aria-label={`Remove d${die.size}`}
            what={`The d${die.size} hit die`}
            onConfirm={() => actions.removeHitDie(die.size)}
          >
            {'✕'}
          </ConfirmDelete>
        </div>
      ))}
      <AddByName
        label="New die size"
        placeholder="8"
        button="Add die type"
        onAdd={(text) => {
          const size = Number(text.trim());
          if (!/^\d+$/.test(text.trim()) || size < 1) return 'A die size is a whole number, e.g. 8';
          return actions.addHitDie(size);
        }}
      />
    </ResponsiveDialog>
  );
}
