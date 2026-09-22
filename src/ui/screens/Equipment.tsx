import { useState } from 'react';
import { CheckRow } from '../components/CheckRow.js';
import { ItemRow } from '../components/ItemRow.js';
import { NameField } from '../components/NameField.js';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import type {
  EquipmentActions,
  EquipmentItemView,
  EquipmentSlot,
  EquipmentView,
} from '../types.js';

interface Props {
  data: EquipmentView;
  actions: EquipmentActions;
  onClose(): void;
}

type Dialog = { kind: 'new'; slot: EquipmentSlot } | { kind: 'edit'; id: string } | null;

export function Equipment({ data, actions, onClose }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const editing =
    dialog?.kind === 'edit'
      ? [...data.weapons, ...data.other].find((item) => item.id === dialog.id)
      : undefined;

  const row = (item: EquipmentItemView) => (
    <ItemRow
      key={item.id}
      name={item.name}
      description={item.description}
      onOpen={() => setDialog({ kind: 'edit', id: item.id })}
    />
  );

  return (
    <div className="bottom">
      <div className="sv">
        <div className="svhead">
          <span className="t">Equipment</span>
          <button type="button" className="close" onClick={onClose} aria-label="Back to sections">
            {'×'}
          </button>
        </div>

        {/* Attuned and Equipped are derived views over both lists, so they carry no add button:
            an item joins them by having its toggle set, not by being created in them. */}
        <div className="sechead-row">
          <span className="sechead static">Attuned Items</span>
        </div>
        {data.attuned.length === 0 ? (
          <div className="empty">Nothing attuned</div>
        ) : (
          data.attuned.map(row)
        )}

        <div className="sechead-row">
          <span className="sechead static">Equipped</span>
        </div>
        {data.equipped.length === 0 ? (
          <div className="empty">Nothing equipped</div>
        ) : (
          data.equipped.map(row)
        )}

        <Slot
          title="Weapons"
          items={data.weapons}
          row={row}
          onAdd={() => setDialog({ kind: 'new', slot: 'weapons' })}
        />
        <Slot
          title="Other Equipment"
          items={data.other}
          row={row}
          onAdd={() => setDialog({ kind: 'new', slot: 'other' })}
        />
      </div>

      {dialog?.kind === 'new' && (
        <NewEquipmentDialog slot={dialog.slot} onCreate={actions.addEquipment} onClose={close} />
      )}
      {editing && <EditEquipmentDialog item={editing} actions={actions} onClose={close} />}
    </div>
  );
}

function Slot({
  title,
  items,
  row,
  onAdd,
}: {
  title: string;
  items: EquipmentItemView[];
  row(item: EquipmentItemView): React.ReactNode;
  onAdd(): void;
}) {
  return (
    <>
      <div className="sechead-row">
        <span className="sechead static">{title}</span>
        <button type="button" className="addmini" onClick={onAdd} aria-label={`Add to ${title}`}>
          +
        </button>
      </div>
      {items.length === 0 ? <div className="empty">Nothing here yet</div> : items.map(row)}
    </>
  );
}

function NewEquipmentDialog({
  slot,
  onCreate,
  onClose,
}: {
  slot: EquipmentSlot;
  onCreate: EquipmentActions['addEquipment'];
  onClose(): void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [attuned, setAttuned] = useState(false);
  const [equipped, setEquipped] = useState(false);

  return (
    <ResponsiveDialog
      title={slot === 'weapons' ? 'New weapon' : 'New equipment'}
      open
      onClose={onClose}
      footer={
        <button
          type="button"
          className="primary"
          disabled={name.trim() === ''}
          onClick={() => {
            onCreate(slot, { name: name.trim(), description, attuned, equipped });
            onClose();
          }}
        >
          Create
        </button>
      }
    >
      <label className="dlabel" htmlFor="new-equipment-name">
        Name
      </label>
      <input
        id="new-equipment-name"
        className="inp"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <label className="dlabel mt12" htmlFor="new-equipment-description">
        Description
      </label>
      <textarea
        id="new-equipment-description"
        className="area"
        rows={4}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <CheckRow label="Attuned" checked={attuned} onChange={setAttuned} />
      <CheckRow label="Equipped" checked={equipped} onChange={setEquipped} />
    </ResponsiveDialog>
  );
}

function EditEquipmentDialog({
  item,
  actions,
  onClose,
}: {
  item: EquipmentItemView;
  actions: EquipmentActions;
  onClose(): void;
}) {
  return (
    <ResponsiveDialog
      title="Edit item"
      open
      onClose={onClose}
      footer={
        <button
          type="button"
          className="del"
          onClick={() => {
            actions.removeEquipment(item.id);
            onClose();
          }}
        >
          Delete
        </button>
      }
    >
      <span className="dlabel">Name</span>
      <NameField
        label="Name"
        value={item.name}
        onCommit={(name) => actions.renameEquipment(item.id, name)}
      />
      <label className="dlabel mt12" htmlFor="equipment-description">
        Description
      </label>
      <textarea
        id="equipment-description"
        className="area"
        rows={4}
        value={item.description}
        onChange={(event) => actions.setEquipmentDescription(item.id, event.target.value)}
      />
      <CheckRow
        label="Attuned"
        checked={item.attuned}
        onChange={(value) => actions.setAttuned(item.id, value)}
      />
      <CheckRow
        label="Equipped"
        checked={item.equipped}
        onChange={(value) => actions.setEquipped(item.id, value)}
      />
    </ResponsiveDialog>
  );
}
