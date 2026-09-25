import { useRef, useState } from 'react';
import { AddByName } from '../components/AddByName.js';
import { NameField } from '../components/NameField.js';
import { NumberField } from '../components/NumberField.js';
import { Portrait } from '../components/Portrait.js';
import { PortraitCropper } from '../components/PortraitCropper.js';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import { ConfirmDelete } from '../components/ConfirmDelete.js';
import type { Crop } from '../portrait.js';
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
  const [dialog, setDialog] = useState<'classes' | 'hitDice' | 'portrait' | null>(null);

  return (
    <div className="vitals">
      <div className="vident">
        <button type="button" className="back" onClick={onBack} aria-label="Back to characters">
          {'‹'}
        </button>
        {/* The character's token: the face beside the name, and the door to a bigger view. */}
        <button
          type="button"
          className="token"
          aria-label={character.portrait === null ? 'Add portrait' : 'View portrait'}
          onClick={() => setDialog('portrait')}
        >
          <Portrait src={character.portrait} name={character.name} />
        </button>
        <div className="vidmain">
          <div className="vtop">
            <NameField
              label="Character name"
              className="vname"
              value={character.name}
              onCommit={actions.renameCharacter}
            />
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
        </div>
      </div>

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
      <PortraitDialog
        open={dialog === 'portrait'}
        onClose={() => setDialog(null)}
        character={character}
        actions={actions}
      />
    </div>
  );
}

function PortraitDialog({ open, onClose, character, actions }: DialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The file being cropped, and the object URL the cropper shows it through.
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const hasPortrait = character.portrait !== null;

  const stopCropping = () => {
    if (picked !== null) URL.revokeObjectURL(picked.url);
    setPicked(null);
    setCrop(null);
  };

  return (
    <ResponsiveDialog
      title="Portrait"
      open={open}
      onClose={() => {
        stopCropping();
        setError(null);
        onClose();
      }}
      footer={
        picked !== null ? (
          <>
            <button type="button" className="secondary" disabled={busy} onClick={stopCropping}>
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || crop === null}
              onClick={() => {
                if (crop === null) return;
                setBusy(true);
                void actions.setPortrait(picked.file, crop).then((message) => {
                  setError(message);
                  setBusy(false);
                  stopCropping();
                });
              }}
            >
              Use image
            </button>
          </>
        ) : (
          <>
            {hasPortrait && (
              <ConfirmDelete
                className="secondary"
                what="The portrait"
                onConfirm={() => {
                  setError(null);
                  actions.removePortrait();
                }}
              >
                Remove
              </ConfirmDelete>
            )}
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => picker.current?.click()}
            >
              {hasPortrait ? 'Change image' : 'Choose image'}
            </button>
          </>
        )
      }
    >
      {picked !== null ? (
        <PortraitCropper
          key={picked.url}
          src={picked.url}
          onChange={setCrop}
          onError={() => {
            stopCropping();
            setError('That file could not be used as a portrait. Try a JPEG or PNG.');
          }}
        />
      ) : (
        <div className="portraitview">
          <Portrait src={character.portrait} name={character.name} />
        </div>
      )}
      {!hasPortrait && picked === null && (
        <div className="hint">
          Pick a picture of {character.name}. It is stored with the character.
        </div>
      )}
      {error !== null && (
        <div className="fieldError" role="alert">
          {error}
        </div>
      )}
      <input
        ref={picker}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const picked = event.currentTarget.files?.[0];
          // Cleared first, so picking the same file again still fires `change`.
          event.currentTarget.value = '';
          if (picked === undefined) return;
          setError(null);
          setPicked({ file: picked, url: URL.createObjectURL(picked) });
        }}
      />
    </ResponsiveDialog>
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
            min={1}
            value={entry.level}
            onChange={(level) => actions.setClassLevel(entry.id, level)}
          />
          <ConfirmDelete
            className="delx"
            aria-label={`Remove ${entry.name}`}
            what={`The ${entry.name} class`}
            onConfirm={() => actions.removeClass(entry.id)}
          >
            {'✕'}
          </ConfirmDelete>
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
