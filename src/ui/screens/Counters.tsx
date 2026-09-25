import { useState } from 'react';
import { pasteLists } from '../components/pasteLists.js';
import { CategorizedSection } from '../components/CategorizedSection.js';
import { ConfirmDelete } from '../components/ConfirmDelete.js';
import { ItemRow } from '../components/ItemRow.js';
import { NameField } from '../components/NameField.js';
import { NumberField } from '../components/NumberField.js';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import { ordinalSuffix } from '../reference.js';
import { CategorySelect, locate, type Located } from './categoryPicker.js';
import type { CategoryView, CountersActions, CountersView, CounterView } from '../types.js';

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
  // not nine. "Set totals" is how it comes back, which is why that button is always present.
  const visibleSlots = data.spellSlots.filter((slot) => slot.total > 0);

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
        <div className="sechead-row">
          <span className="sechead static">Spell Slots</span>
          <button type="button" className="txtbtn" onClick={() => setDialog({ kind: 'slots' })}>
            Set totals
          </button>
        </div>
        <div className="slotblock">
          {visibleSlots.length === 0 ? (
            <div className="empty">No spell slots yet — tap “Set totals”.</div>
          ) : (
            visibleSlots.map((slot) => (
              <div className="slotrow" key={slot.level}>
                <span className="slotlvl">
                  {slot.level}
                  {ordinalSuffix(slot.level)}
                </span>
                <span className="valcluster">
                  <NumberField
                    label={`Level ${slot.level} slots remaining`}
                    className="curinp"
                    value={slot.current}
                    onChange={(value) => actions.setSpellSlotCurrent(slot.level, value)}
                    stepper
                  />
                  <span className="maxlbl">/ {slot.total}</span>
                </span>
              </div>
            ))
          )}
        </div>
      </CategorizedSection>

      {dialog?.kind === 'slots' && (
        <ResponsiveDialog title="Spell slot totals" open onClose={close}>
          <div className="hint" style={{ marginTop: 0 }}>
            Set slots per level. 0 hides the level.
          </div>
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
        </ResponsiveDialog>
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
