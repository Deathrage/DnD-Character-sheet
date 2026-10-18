import { useState } from 'react';
import { pasteLists } from '../components/pasteLists.js';
import { CategorizedSection } from '../components/CategorizedSection.js';
import { ConfirmDelete } from '../components/ConfirmDelete.js';
import { ItemRow } from '../components/ItemRow.js';
import { NameField } from '../components/NameField.js';
import { NumberField } from '../components/NumberField.js';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import { ordinalSuffix } from '../reference.js';
import { CheckRow } from '../components/CheckRow.js';
import { CategorySelect, locate, type Located } from './categoryPicker.js';
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

export function Counters({ characterId, data, actions, onClose }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const editing = dialog?.kind === 'edit' ? locate(data, dialog.id) : undefined;

  // A level with no slots at all is hidden rather than shown as 0/0 — a wizard has three rows,
  // not nine — and so is the pact row, for everyone but a warlock. With no slots of either kind
  // there is no table at all, only the button that sets some up.
  const pact = data.pactSlots;
  const visibleSlots = data.spellSlots.filter((slot) => slot.total > 0);
  const hasSlots = pact.total > 0 || visibleSlots.length > 0;
  const openSlots = () => setDialog({ kind: 'slots' });

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
          <ItemRow
            name={counter.name}
            description={counter.description}
            dim={counter.current <= 0}
            onOpen={() => setDialog({ kind: 'edit', id: counter.id })}
            after={
              <span className="valcluster">
                <NumberField
                  label={`${counter.name} remaining`}
                  className="curinp"
                  value={counter.current}
                  onChange={(value) => actions.setCounterCurrent(counter.id, value)}
                  stepper
                />
                <span className="maxlbl">/ {counter.total}</span>
              </span>
            }
          />
        )}
      >
        {hasSlots ? (
          <>
            <div className="sechead-row">
              <span className="sechead static">Spell Slots</span>
              <button
                type="button"
                className="txtbtn"
                aria-label="Edit spell slots"
                onClick={openSlots}
              >
                Edit
              </button>
            </div>
            <div className="slotblock">
              {pact.total > 0 && (
                <SlotRow
                  name={`Pact ${pact.level}${ordinalSuffix(pact.level)}`}
                  label="Pact slots remaining"
                  slot={pact}
                  onChange={actions.setPactSlotCurrent}
                />
              )}
              {visibleSlots.map((slot) => (
                <SlotRow
                  key={slot.level}
                  name={`${slot.level}${ordinalSuffix(slot.level)}`}
                  label={`Level ${slot.level} slots remaining`}
                  slot={slot}
                  onChange={(value) => actions.setSpellSlotCurrent(slot.level, value)}
                />
              ))}
            </div>
          </>
        ) : (
          <div className="sechead-row">
            <button type="button" className="txtbtn" onClick={openSlots}>
              Set spell slots
            </button>
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
          located={editing}
          categories={data.categories}
          actions={actions}
          onClose={close}
        />
      )}
    </>
  );
}

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
                  {level}
                  {ordinalSuffix(level)}
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
              <span className="lv">
                {slot.level}
                {ordinalSuffix(slot.level)} level
              </span>
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

function NewCounterDialog({
  categoryId,
  categories,
  onCreate,
  onClose,
}: {
  categoryId: string | null;
  categories: CategoryView<CounterView>[];
  onCreate: CountersActions['addCounter'];
  onClose(): void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [total, setTotal] = useState(1);
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
            onCreate(target, { name: name.trim(), description, total });
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
          <NumberField label="Total" className="inp" value={total} onChange={setTotal} />
        </div>
        <div className="col">
          <CategorySelect value={target} categories={categories} onChange={setTarget} />
        </div>
      </div>
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

function EditCounterDialog({
  located,
  categories,
  actions,
  onClose,
}: {
  located: Located<CounterView>;
  categories: CategoryView<CounterView>[];
  actions: CountersActions;
  onClose(): void;
}) {
  const { item: counter, categoryId } = located;

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
          />
        </div>
        <div className="col">
          <span className="dlabel">Total</span>
          <NumberField
            label="Total"
            className="inp"
            value={counter.total}
            onChange={(value) => actions.setCounterTotal(counter.id, value)}
          />
        </div>
      </div>
      <CategorySelect
        value={categoryId}
        categories={categories}
        onChange={(id) => actions.moveCounter(counter.id, id)}
      />
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
