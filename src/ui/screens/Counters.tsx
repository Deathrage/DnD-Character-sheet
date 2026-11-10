import { memo, useCallback, useState } from 'react';
import { MIN_STEP } from '../../shared/decimal.js';
import { pasteLists } from '../components/pasteLists.js';
import { CategorizedSection } from '../components/CategorizedSection.js';
import { ConfirmDelete } from '../components/ConfirmDelete.js';
import { ItemRow } from '../components/ItemRow.js';
import { NameField } from '../components/NameField.js';
import { NumberField } from '../components/NumberField.js';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import { ordinal } from '../reference.js';
import { CheckRow } from '../components/CheckRow.js';
import { CategorySelect, locate } from './categoryPicker.js';
import type {
  CategoryView,
  CountersActions,
  CountersView,
  CounterView,
  SpellSlotView,
} from '../types.js';

interface Props {
  characterId: string;
  data: CountersView;
  actions: CountersActions;
  onClose(): void;
}

type Dialog =
  | { kind: 'new'; categoryId: string | null }
  | { kind: 'edit'; id: string }
  | { kind: 'slots' }
  | null;

export const Counters = memo(function Counters({ characterId, data, actions, onClose }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const editing = dialog?.kind === 'edit' ? locate(data, dialog.id) : undefined;
  const openCounter = useCallback((id: string) => setDialog({ kind: 'edit', id }), []);

  // A level with no slots at all is hidden rather than shown as 0/0 — a wizard has three rows,
  // not nine — and so is the pact row, for everyone but a warlock. With no slots of either kind
  // there is no table at all, only the button that sets some up.
  const pact = data.pactSlots;
  const rows = [
    {
      key: 'pact',
      name: `Pact ${ordinal(pact.level)}`,
      label: 'Pact slots remaining',
      slot: pact,
      onChange: actions.setPactSlotCurrent,
    },
    ...data.spellSlots.map((slot) => ({
      key: String(slot.level),
      name: ordinal(slot.level),
      label: `Level ${slot.level} slots remaining`,
      slot,
      onChange: (value: number) => actions.setSpellSlotCurrent(slot.level, value),
    })),
  ].filter((row) => row.slot.total > 0);
  const hasSlots = rows.length > 0;

  return (
    <>
      <CategorizedSection
        characterId={characterId}
        title="Counters"
        data={data}
        actions={actions}
        onClose={onClose}
        onAdd={(categoryId) => setDialog({ kind: 'new', categoryId })}
        renderRow={(counter) => (
          <CounterRow
            counter={counter}
            onOpen={openCounter}
            onSetCurrent={actions.setCounterCurrent}
          />
        )}
      >
        <div className="sechead-row">
          {hasSlots && <span className="sechead static">Spell Slots</span>}
          <button
            type="button"
            className="txtbtn"
            aria-label={hasSlots ? 'Edit spell slots' : undefined}
            onClick={() => setDialog({ kind: 'slots' })}
          >
            {hasSlots ? 'Edit' : 'Set spell slots'}
          </button>
        </div>
        {hasSlots && (
          <div className="slotblock">
            {rows.map(({ key, ...row }) => (
              <SlotRow key={key} {...row} />
            ))}
          </div>
        )}
      </CategorizedSection>

      {dialog?.kind === 'slots' && (
        <SpellSlotsDialog data={data} actions={actions} onClose={close} />
      )}
      {dialog?.kind === 'new' && (
        <NewCounterDialog
          categoryId={dialog.categoryId}
          categories={data.categories}
          onCreate={actions.addCounter}
          onClose={close}
        />
      )}
      {editing && (
        <EditCounterDialog
          counter={editing.item}
          categoryId={editing.categoryId}
          categories={data.categories}
          actions={actions}
          onClose={close}
        />
      )}
    </>
  );
});

/**
 * Memoised: a change elsewhere leaves `counter` the same object (`bind.ts` keeps it).
 * `labelPrefix` starts both accessible names with a companion's name; without it, the row's
 * button is named by its visible text, as on this screen.
 */
export const CounterRow = memo(function CounterRow({
  counter,
  onOpen,
  onSetCurrent,
  labelPrefix,
}: {
  counter: CounterView;
  onOpen(id: string): void;
  onSetCurrent: CountersActions['setCounterCurrent'];
  labelPrefix?: string;
}) {
  const name = labelPrefix === undefined ? counter.name : `${labelPrefix} ${counter.name}`;
  return (
    <ItemRow
      name={counter.name}
      description={counter.description}
      dim={counter.current <= 0}
      onOpen={() => onOpen(counter.id)}
      {...(labelPrefix === undefined ? {} : { label: name })}
      after={
        <span className="valcluster">
          <NumberField
            label={`${name} remaining`}
            className="curinp"
            value={counter.current}
            onChange={(value) => onSetCurrent(counter.id, value)}
            stepper
            decimal
            step={counter.step}
          />
          <span className="maxlbl">/ {counter.total}</span>
        </span>
      }
    />
  );
});

function SlotRow({
  name,
  label,
  slot,
  onChange,
}: {
  name: string;
  label: string;
  slot: SpellSlotView;
  onChange(value: number): void;
}) {
  return (
    <div className="slotrow">
      <span className="slotlvl">{name}</span>
      <span className="valcluster">
        <NumberField
          label={label}
          className="curinp"
          value={slot.current}
          onChange={onChange}
          stepper
        />
        <span className="maxlbl">/ {slot.total}</span>
      </span>
    </div>
  );
}

/**
 * Both kinds of slot, each behind a switch. A switch is this dialog's state and never stored: it
 * opens on when its kind has a slot, and switching it off sets that kind's slots to 0, so what it
 * says always matches what the sheet shows once the dialog closes. The pact level is left as it
 * was: at 0 slots it means nothing, and it pre-fills the next time the switch goes on.
 */
function SpellSlotsDialog({
  data,
  actions,
  onClose,
}: {
  data: CountersView;
  actions: CountersActions;
  onClose(): void;
}) {
  const [pactOn, setPactOn] = useState(data.pactSlots.total > 0);
  const [slotsOn, setSlotsOn] = useState(data.spellSlots.some((slot) => slot.total > 0));

  const switchPact = (on: boolean) => {
    setPactOn(on);
    if (on) return;
    actions.setPactSlotTotal(0);
    actions.setPactSlotCurrent(0);
  };
  const switchSlots = (on: boolean) => {
    setSlotsOn(on);
    if (on) return;
    for (const slot of data.spellSlots) {
      actions.setSpellSlotTotal(slot.level, 0);
      actions.setSpellSlotCurrent(slot.level, 0);
    }
  };

  return (
    <ResponsiveDialog title="Spell slots" open onClose={onClose}>
      <CheckRow label="Pact magic" checked={pactOn} onChange={switchPact} />
      {pactOn && (
        <div>
          <div className="setup-row">
            <label className="lv" htmlFor="pact-level">
              Level
            </label>
            <select
              id="pact-level"
              className="inp"
              value={data.pactSlots.level}
              onChange={(event) => actions.setPactSlotLevel(Number(event.target.value))}
            >
              {data.spellSlots.map(({ level }) => (
                <option key={level} value={level}>
                  {ordinal(level)}
                </option>
              ))}
            </select>
          </div>
          <div className="setup-row">
            <span className="lv">Slots</span>
            <NumberField
              label="Pact slot total"
              className="inp"
              value={data.pactSlots.total}
              onChange={actions.setPactSlotTotal}
            />
          </div>
        </div>
      )}
      <CheckRow label="Spell slots" checked={slotsOn} onChange={switchSlots} />
      {slotsOn && (
        <div>
          <div className="hint">Set slots per level. 0 hides the level.</div>
          {data.spellSlots.map((slot) => (
            <div className="setup-row" key={slot.level}>
              <span className="lv">{ordinal(slot.level)} level</span>
              <NumberField
                label={`Level ${slot.level} slot total`}
                className="inp"
                value={slot.total}
                onChange={(value) => actions.setSpellSlotTotal(slot.level, value)}
              />
            </div>
          ))}
        </div>
      )}
    </ResponsiveDialog>
  );
}

/**
 * Shared with a companion's counters, which have no categories: without `categories` there is
 * no picker at all, since an empty one would still offer Uncategorized.
 */
export function NewCounterDialog({
  categoryId,
  categories,
  onCreate,
  onClose,
}: {
  categoryId: string | null;
  categories?: CategoryView<CounterView>[];
  onCreate: CountersActions['addCounter'];
  onClose(): void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [total, setTotal] = useState(1);
  const [step, setStep] = useState(1);
  const [target, setTarget] = useState(categoryId);

  return (
    <ResponsiveDialog
      title="New counter"
      open
      onClose={onClose}
      footer={
        <button
          type="button"
          className="primary"
          disabled={name.trim() === ''}
          onClick={() => {
            onCreate(target, { name: name.trim(), description, total, step });
            onClose();
          }}
        >
          Create
        </button>
      }
    >
      <label className="dlabel" htmlFor="new-counter-name">
        Name
      </label>
      <input
        id="new-counter-name"
        className="inp"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="row2">
        <div className="col">
          <span className="dlabel">Total</span>
          <NumberField label="Total" className="inp" value={total} onChange={setTotal} decimal />
        </div>
        <StepField value={step} onChange={setStep} />
      </div>
      <StepHint />
      {categories !== undefined && (
        <CategorySelect value={target} categories={categories} onChange={setTarget} />
      )}
      <label className="dlabel mt12" htmlFor="new-counter-description">
        Note
      </label>
      <textarea
        onPaste={pasteLists}
        id="new-counter-description"
        className="area"
        rows={3}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
    </ResponsiveDialog>
  );
}

/** What the edit dialog writes through. Moving is optional: a companion's counter stays put. */
export type CounterEditActions = Pick<
  CountersActions,
  | 'renameCounter'
  | 'setCounterDescription'
  | 'setCounterCurrent'
  | 'setCounterTotal'
  | 'setCounterStep'
  | 'removeCounter'
> & { moveCounter?: CountersActions['moveCounter'] };

/** Like `NewCounterDialog`, it shows the category picker only when it is given categories. */
export function EditCounterDialog({
  counter,
  categoryId = null,
  categories,
  actions,
  onClose,
}: {
  counter: CounterView;
  categoryId?: string | null;
  categories?: CategoryView<CounterView>[];
  actions: CounterEditActions;
  onClose(): void;
}) {
  return (
    <ResponsiveDialog
      title="Edit counter"
      open
      onClose={onClose}
      footer={
        <ConfirmDelete
          what={counter.name}
          onConfirm={() => {
            actions.removeCounter(counter.id);
            onClose();
          }}
        >
          Delete
        </ConfirmDelete>
      }
    >
      <span className="dlabel">Name</span>
      <NameField
        label="Name"
        value={counter.name}
        onCommit={(name) => actions.renameCounter(counter.id, name)}
      />
      <div className="row2">
        <div className="col">
          <span className="dlabel">Remaining</span>
          <NumberField
            label="Remaining"
            className="inp"
            value={counter.current}
            onChange={(value) => actions.setCounterCurrent(counter.id, value)}
            decimal
          />
        </div>
        <div className="col">
          <span className="dlabel">Total</span>
          <NumberField
            label="Total"
            className="inp"
            value={counter.total}
            onChange={(value) => actions.setCounterTotal(counter.id, value)}
            decimal
          />
        </div>
      </div>
      <div className="row2">
        <StepField
          value={counter.step}
          onChange={(value) => actions.setCounterStep(counter.id, value)}
        />
        {categories !== undefined && (
          <div className="col">
            <CategorySelect
              value={categoryId}
              categories={categories}
              onChange={(id) => actions.moveCounter?.(counter.id, id)}
            />
          </div>
        )}
      </div>
      <StepHint />
      <label className="dlabel mt12" htmlFor="counter-description">
        Note
      </label>
      <textarea
        onPaste={pasteLists}
        id="counter-description"
        className="area"
        rows={3}
        value={counter.description}
        onChange={(event) => actions.setCounterDescription(counter.id, event.target.value)}
      />
    </ResponsiveDialog>
  );
}

/**
 * The Step column of a `.row2`: what − and + move the counter by. `min` is the smallest step
 * three decimal places can express, so a typed 0 — a button that does nothing — never reaches
 * the setter, which would throw `NOT_POSITIVE`.
 */
function StepField({ value, onChange }: { value: number; onChange(value: number): void }) {
  return (
    <div className="col">
      <span className="dlabel">Step</span>
      <NumberField
        label="Step"
        className="inp"
        value={value}
        onChange={onChange}
        decimal
        min={MIN_STEP}
      />
    </div>
  );
}

function StepHint() {
  return (
    <div className="hint tight">
      − and + move it by the step. 0.5 or 0.1 lets it count in parts.
    </div>
  );
}
