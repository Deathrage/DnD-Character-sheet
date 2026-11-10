import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { AbilityRow, type AbilityRowActions } from '../components/AbilityRow.js';
import { AddByName } from '../components/AddByName.js';
import { CheckRow } from '../components/CheckRow.js';
import { ConfirmDelete } from '../components/ConfirmDelete.js';
import { HitDiceDialog, type HitDieActions } from '../components/HitDiceDialog.js';
import { NameField } from '../components/NameField.js';
import { pasteLists } from '../components/pasteLists.js';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import { VitalTiles, type TileActions } from '../components/VitalTiles.js';
import { formatHitPoints } from '../format.js';
import { usePersistedState } from '../persistedState.js';
import { ABILITIES } from '../reference.js';
import type { CompanionsActions, CompanionView, CountersActions } from '../types.js';
import {
  CounterRow,
  EditCounterDialog,
  NewCounterDialog,
  type CounterEditActions,
} from './Counters.js';

interface Props {
  characterId: string;
  data: CompanionView[];
  actions: CompanionsActions;
  onClose(): void;
}

/** Which blocks are open, by `${companionId}` or `${companionId}/${Sub}`. */
type Folds = Record<string, boolean>;

/**
 * Familiars, steeds, summons: each a block like a category, folded by default, holding the
 * sheet's own tiles, ability rows and counter rows. Every number is the player's; nothing here
 * is read from the character.
 */
export const Companions = memo(function Companions({ characterId, data, actions, onClose }: Props) {
  // One record for the whole screen, keyed by id because names may repeat. View state, so it is
  // remembered per character in localStorage and never in the document. A companion starts
  // folded and its three sub-sections open; only what the player changed is stored.
  // ponytail: a deleted companion's keys stay in the record; a few bytes each.
  const [folds, setFolds] = usePersistedState<Folds>(`ui:${characterId}:companions`, {});
  // Stable while the folds hold, so stepping one companion's HP re-renders that block only.
  const fold = useCallback(
    (key: string, open: boolean) => setFolds({ ...folds, [key]: open }),
    [folds, setFolds],
  );
  const [adding, setAdding] = useState(false);

  return (
    <div className="bottom">
      <div className="sv">
        <div className="svhead">
          <button type="button" className="back" onClick={onClose} aria-label="Back to sections">
            {'‹'}
          </button>
          <span className="t">Companions</span>
        </div>

        {data.map((companion) => (
          <CompanionBlock
            key={companion.id}
            companion={companion}
            actions={actions}
            folds={folds}
            onFold={fold}
          />
        ))}

        <button type="button" className="newcat" onClick={() => setAdding(true)}>
          + New companion
        </button>
      </div>

      {adding && (
        <ResponsiveDialog title="New companion" open onClose={() => setAdding(false)}>
          <AddByName
            label="Companion name"
            placeholder="e.g. Owl"
            button="Create"
            onAdd={(name) => {
              const added = actions.addCompanion(name);
              if (!added.ok) return added.message;
              // The one just made is the one about to be filled in.
              setFolds({ ...folds, [added.id]: true });
              setAdding(false);
              return null;
            }}
          />
        </ResponsiveDialog>
      )}
    </div>
  );
});

type Sub = 'abilities' | 'statblock' | 'counters';

type BlockDialog =
  | { kind: 'edit' }
  | { kind: 'hitDice' }
  | { kind: 'newCounter' }
  | { kind: 'editCounter'; counterId: string }
  | null;

/**
 * One companion, memoised: a change to another leaves `companion` the same object (`bind.ts`
 * keeps it), and everything else it takes is stable. Its dialogs live here, after its block, so
 * a companion or counter that vanishes takes its open dialog with it.
 */
const CompanionBlock = memo(function CompanionBlock({
  companion,
  actions,
  folds,
  onFold,
}: {
  companion: CompanionView;
  actions: CompanionsActions;
  folds: Folds;
  onFold(key: string, open: boolean): void;
}) {
  const { id, name } = companion;
  const own = useMemo(() => companionActions(actions, id), [actions, id]);
  const [dialog, setDialog] = useState<BlockDialog>(null);
  const close = () => setDialog(null);
  const openCounter = useCallback(
    (counterId: string) => setDialog({ kind: 'editCounter', counterId }),
    [],
  );

  const open = folds[id] === true;
  const sub = (key: Sub) => ({
    open: folds[`${id}/${key}`] !== false,
    onToggle: () => onFold(`${id}/${key}`, folds[`${id}/${key}`] === false),
  });
  const abilities = sub('abilities');
  const statBlock = sub('statblock');
  const counters = sub('counters');
  const editing =
    dialog?.kind === 'editCounter'
      ? companion.counters.find((counter) => counter.id === dialog.counterId)
      : undefined;

  return (
    <>
      {/* The heading's sticky box: it pins only while its own body scrolls past, is pushed out
          where the body ends, and has nowhere to move while folded. */}
      <div className="compblock">
        <div className="sechead-row companion">
          <button
            type="button"
            className="sechead"
            aria-expanded={open}
            onClick={() => onFold(id, !open)}
          >
            <span className="caret" aria-hidden="true">
              {open ? '▾' : '▸'}
            </span>
            {/* The space is for the accessible name, "Vestige 9/16"; a flex row drops it. */}
            <span className="nmtxt">{name}</span>{' '}
            <span className="ccount">{formatHitPoints(companion.hitPoints)}</span>
          </button>
          <span className="sec-actions">
            <button
              type="button"
              className="editcat"
              onClick={() => setDialog({ kind: 'edit' })}
              aria-label={`Edit companion ${name}`}
            >
              {'✎'}
            </button>
          </span>
        </div>

        {open && (
          <div className="compbody">
            <VitalTiles
              labelPrefix={name}
              hitPoints={companion.hitPoints}
              hitDices={companion.hitDices}
              armorClass={companion.armorClass}
              initiative={companion.initiative}
              actions={own}
              onOpenHitDice={() => setDialog({ kind: 'hitDice' })}
            />

            <SubHeading name={name} label="Abilities" {...abilities} />
            {abilities.open && (
              <div className="subbody">
                <div className="abhead nomark" aria-hidden="true">
                  <span>Ability</span>
                  <span>Score</span>
                  <span>Mod</span>
                  <span>Save</span>
                </div>
                {ABILITIES.map((ability) => (
                  <AbilityRow
                    key={ability.key}
                    ability={ability}
                    value={companion.abilities[ability.key]}
                    actions={own}
                    labelPrefix={name}
                  />
                ))}
              </div>
            )}

            <SubHeading name={name} label="Stat block" {...statBlock} />
            {statBlock.open && (
              <div className="subbody">
                {/* Named by its label, not an id from the name: names may repeat. */}
                <textarea
                  onPaste={pasteLists}
                  className="area"
                  aria-label={`${name} stat block`}
                  rows={8}
                  placeholder={'Speed, senses, traits, actions…'}
                  value={companion.description}
                  onChange={(event) => actions.setCompanionDescription(id, event.target.value)}
                />
              </div>
            )}

            {/* The + sits beside the fold, so a counter can be added while the list is folded. */}
            <SubHeading name={name} label="Counters" {...counters}>
              <button
                type="button"
                className="addmini"
                onClick={() => setDialog({ kind: 'newCounter' })}
                aria-label={`Add counter to ${name}`}
              >
                +
              </button>
            </SubHeading>
            {counters.open && companion.counters.length > 0 && (
              <div className="subbody">
                {companion.counters.map((counter) => (
                  <CounterRow
                    key={counter.id}
                    counter={counter}
                    onOpen={openCounter}
                    onSetCurrent={own.setCounterCurrent}
                    labelPrefix={name}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {dialog?.kind === 'edit' && (
        <CompanionDialog companion={companion} actions={actions} onClose={close} />
      )}
      {dialog?.kind === 'hitDice' && companion.hitDices !== null && (
        <HitDiceDialog
          open
          onClose={close}
          title={`${name}: Hit Dices`}
          dice={companion.hitDices}
          actions={own}
        />
      )}
      {dialog?.kind === 'newCounter' && (
        <NewCounterDialog categoryId={null} onCreate={own.addCounter} onClose={close} />
      )}
      {editing && <EditCounterDialog counter={editing} actions={own} onClose={close} />}
    </>
  );
});

/** Abilities, Stat block and Counters: a caret and a label that fold, named for the companion. */
function SubHeading({
  name,
  label,
  open,
  onToggle,
  children,
}: {
  name: string;
  label: string;
  open: boolean;
  onToggle(): void;
  children?: ReactNode;
}) {
  return (
    <div className="compsub">
      <button
        type="button"
        className="subtoggle"
        aria-expanded={open}
        aria-label={`${name} ${label.toLowerCase()}`}
        onClick={onToggle}
      >
        <span className="caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span className="dlabel">{label}</span>
      </button>
      {children}
    </div>
  );
}

/**
 * The ✎ dialog. The switches write when they change and never on close: switching one on keeps
 * what it had, and switching it off forgets it without asking, as Pact magic and Stackable do.
 * Deleting asks, unlike a category: a companion's numbers, text and counters go with it.
 */
function CompanionDialog({
  companion,
  actions,
  onClose,
}: {
  companion: CompanionView;
  actions: CompanionsActions;
  onClose(): void;
}) {
  const { id, name } = companion;
  return (
    <ResponsiveDialog
      title="Companion"
      open
      onClose={onClose}
      footer={
        <ConfirmDelete
          what={`The companion ${name}`}
          onConfirm={() => {
            actions.removeCompanion(id);
            onClose();
          }}
        >
          Delete companion
        </ConfirmDelete>
      }
    >
      <span className="dlabel">Companion name</span>
      <NameField
        label="Companion name"
        value={name}
        onCommit={(next) => actions.renameCompanion(id, next)}
      />
      <CheckRow
        label="Rolls initiative"
        checked={companion.initiative !== null}
        onChange={(on) => actions.setCompanionRollsInitiative(id, on)}
      />
      <div className="hint">Leave it off if it uses your initiative.</div>
      <CheckRow
        label="Hit Dices"
        checked={companion.hitDices !== null}
        onChange={(on) => actions.setCompanionHasHitDices(id, on)}
      />
      <div className="hint">Leave it off if it has none.</div>
    </ResponsiveDialog>
  );
}

type OwnActions = TileActions &
  HitDieActions &
  AbilityRowActions &
  CounterEditActions & { addCounter: CountersActions['addCounter'] };

/**
 * One companion's actions in the shapes the shared tiles, rows and dialogs already speak, each
 * bound to its id. Built once per companion, so the memoised rows below keep their callbacks.
 */
function companionActions(actions: CompanionsActions, id: string): OwnActions {
  return {
    setCurrentHitPoints: (value) => actions.setCompanionCurrentHitPoints(id, value),
    setTotalHitPoints: (value) => actions.setCompanionTotalHitPoints(id, value),
    setTemporaryHitPoints: (value) => actions.setCompanionTemporaryHitPoints(id, value),
    setArmorClass: (value) => actions.setCompanionArmorClass(id, value),
    setInitiative: (value) => actions.setCompanionInitiative(id, value),
    addHitDie: (size) => actions.addCompanionHitDie(id, size),
    setHitDieCurrent: (size, value) => actions.setCompanionHitDieCurrent(id, size, value),
    setHitDieTotal: (size, value) => actions.setCompanionHitDieTotal(id, size, value),
    removeHitDie: (size) => actions.removeCompanionHitDie(id, size),
    setAbilityScore: (key, value) => actions.setCompanionAbilityScore(id, key, value),
    setAbilityModifier: (key, value) => actions.setCompanionAbilityModifier(id, key, value),
    setSavingThrowModifier: (key, value) => actions.setCompanionSavingThrowModifier(id, key, value),
    // A companion's counters have no categories, so the category the dialog passes is null.
    addCounter: (_category, counter) => actions.addCompanionCounter(id, counter),
    renameCounter: (counterId, name) => actions.renameCompanionCounter(id, counterId, name),
    setCounterDescription: (counterId, text) =>
      actions.setCompanionCounterDescription(id, counterId, text),
    setCounterCurrent: (counterId, value) =>
      actions.setCompanionCounterCurrent(id, counterId, value),
    setCounterTotal: (counterId, value) => actions.setCompanionCounterTotal(id, counterId, value),
    setCounterStep: (counterId, step) => actions.setCompanionCounterStep(id, counterId, step),
    removeCounter: (counterId) => actions.removeCompanionCounter(id, counterId),
  };
}
