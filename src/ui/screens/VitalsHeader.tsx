import { useState } from 'react';
import { AddByName } from '../components/AddByName.js';
import { NameField } from '../components/NameField.js';
import { NumberField } from '../components/NumberField.js';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import type { CharacterView, VitalsActions } from '../types.js';

interface Props {
  character: CharacterView;
  actions: VitalsActions;
  onBack(): void;
}

/**
 * The pinned header of the hub: name, total level, the classes button, and the HP / hit dice /
 * AC tiles. Classes and hit dice open dialogs, exactly as in the wireframe — both are lists
 * that would crowd a header that has to stay visible above every section.
 */
export function VitalsHeader({ character, actions, onBack }: Props) {
  const [dialog, setDialog] = useState<'classes' | 'hitDice' | null>(null);

  return (
    <div className="vitals">
      <div className="vtop">
        <button type="button" className="back" onClick={onBack} aria-label="Back to characters">
          {'‹'}
        </button>
        <span className="vname">{character.name}</span>
        {/* Derived on the facade, never stored — see spec §1's deliberate exception. */}
        <span className="lvpill">Lvl {character.level}</span>
      </div>

      <button type="button" className="classbtn" onClick={() => setDialog('classes')}>
        {character.classes.length === 0 ? (
          <span className="clsum placeholder">Add class{'…'}</span>
        ) : (
          <span className="clsum">
            {character.classes.map((entry) => `${entry.name} ${entry.level}`).join(' · ')}
          </span>
        )}
        <span className="chev">{'›'}</span>
      </button>

      <div className="tiles">
        <div className="tile hp">
          <div>
            <div className="tl">Hit Points</div>
            <div className="hpwrap">
              {/* Steppers go on the numbers that move during a fight — current HP and temp —
                  and not on max HP or AC, which are set once a level and would only lose the
                  row the width. */}
              <NumberField
                label="Current hit points"
                value={character.hitPoints.current}
                onChange={actions.setCurrentHitPoints}
                stepper
              />
              <span className="slash">/</span>
              <NumberField
                label="Total hit points"
                value={character.hitPoints.total}
                onChange={actions.setTotalHitPoints}
              />
            </div>
          </div>
          <div className="tempbox">
            <div className="tl">Temp</div>
            <NumberField
              label="Temporary hit points"
              value={character.hitPoints.temporary}
              onChange={actions.setTemporaryHitPoints}
              stepper
            />
          </div>
        </div>

        <button type="button" className="tile btn" onClick={() => setDialog('hitDice')}>
          <span className="tl">Hit Dice</span>
          <span className="tval hdtile">{summariseHitDice(character)}</span>
        </button>

        <div className="tile">
          <div className="tl">Armor Class</div>
          <NumberField
            label="Armor class"
            value={character.armorClass}
            onChange={actions.setArmorClass}
          />
        </div>
      </div>

      <ClassesDialog
        open={dialog === 'classes'}
        onClose={() => setDialog(null)}
        character={character}
        actions={actions}
      />
      <HitDiceDialog
        open={dialog === 'hitDice'}
        onClose={() => setDialog(null)}
        character={character}
        actions={actions}
      />
    </div>
  );
}

function summariseHitDice({ hitDices }: CharacterView): string {
  if (hitDices.length === 0) return 'Tap to set up';
  return hitDices.map((die) => `${die.current}/${die.total} d${die.size}`).join(' · ');
}

interface DialogProps {
  open: boolean;
  onClose(): void;
  character: CharacterView;
  actions: VitalsActions;
}

function ClassesDialog({ open, onClose, character, actions }: DialogProps) {
  return (
    <ResponsiveDialog title="Classes" open={open} onClose={onClose}>
      <div className="hint" style={{ marginTop: 0 }}>
        Class name is free text; the levels add up to your total.
      </div>
      {character.classes.length === 0 && <div className="empty">No classes yet.</div>}
      {character.classes.map((entry) => (
        <div className="clsrow" key={entry.id}>
          <NameField
            label={`Name of class ${entry.name}`}
            value={entry.name}
            onCommit={(name) => actions.renameClass(entry.id, name)}
          />
          <NumberField
            label={`Level of ${entry.name}`}
            className="curinp cllv"
            value={entry.level}
            onChange={(level) => actions.setClassLevel(entry.id, level)}
          />
          <button
            type="button"
            className="delx"
            aria-label={`Remove ${entry.name}`}
            onClick={() => actions.removeClass(entry.id)}
          >
            {'✕'}
          </button>
        </div>
      ))}
      <AddByName
        label="New class"
        placeholder="Class (e.g. Rogue)"
        button="Add class"
        onAdd={actions.addClass}
      />
      <div className="hint">Total level: {character.level}</div>
    </ResponsiveDialog>
  );
}

function HitDiceDialog({ open, onClose, character, actions }: DialogProps) {
  return (
    <ResponsiveDialog title="Hit Dice" open={open} onClose={onClose}>
      <div className="hint" style={{ marginTop: 0 }}>
        Set up each die type with its total and current count.
      </div>
      {character.hitDices.length === 0 && <div className="empty">No hit dice yet.</div>}
      {character.hitDices.map((die) => (
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
          <button
            type="button"
            className="delx"
            aria-label={`Remove d${die.size}`}
            onClick={() => actions.removeHitDie(die.size)}
          >
            {'✕'}
          </button>
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
