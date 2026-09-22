import { useState } from 'react';
import { ItemRow } from '../components/ItemRow.js';
import { NameField } from '../components/NameField.js';
import { NumberField } from '../components/NumberField.js';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import { COINS } from '../reference.js';
import type { InventoryActions, InventoryItemView, InventoryView } from '../types.js';

interface Props {
  data: InventoryView;
  actions: InventoryActions;
  onClose(): void;
}

export function Inventory({ data, actions, onClose }: Props) {
  const [dialog, setDialog] = useState<'new' | string | null>(null);
  const editing = data.items.find((item) => item.id === dialog);

  return (
    <div className="bottom">
      <div className="sv">
        <div className="svhead">
          <span className="t">Inventory</span>
          <button type="button" className="close" onClick={onClose} aria-label="Back to sections">
            {'×'}
          </button>
        </div>

        <div className="sechead-row">
          <span className="sechead static">Coins</span>
        </div>
        <div className="coins">
          {COINS.map((coin) => (
            <div className="coin" key={coin.key}>
              <div className="cl">{coin.label}</div>
              <NumberField
                label={`${coin.label} coins`}
                value={data.coins[coin.key]}
                onChange={(value) => actions.setCoin(coin.key, value)}
              />
            </div>
          ))}
        </div>

        <div className="sechead-row">
          <span className="sechead static">Items</span>
          <button
            type="button"
            className="addmini"
            onClick={() => setDialog('new')}
            aria-label="Add item"
          >
            +
          </button>
        </div>
        {data.items.length === 0 ? (
          <div className="empty">No items yet</div>
        ) : (
          data.items.map((item) => (
            <ItemRow
              key={item.id}
              name={item.name}
              description={item.description}
              onOpen={() => setDialog(item.id)}
              after={
                // The count is editable from the row: it is the field that changes when you
                // drink a potion, and opening a dialog to decrement it is friction per use.
                <NumberField
                  label={`${item.name} count`}
                  className="num qty"
                  value={item.count}
                  onChange={(value) => actions.setItemCount(item.id, value)}
                />
              }
            />
          ))
        )}
      </div>

      {dialog === 'new' && (
        <NewItemDialog onCreate={actions.addItem} onClose={() => setDialog(null)} />
      )}
      {editing && (
        <EditItemDialog item={editing} actions={actions} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

function NewItemDialog({
  onCreate,
  onClose,
}: {
  onCreate: InventoryActions['addItem'];
  onClose(): void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [count, setCount] = useState(1);

  return (
    <ResponsiveDialog
      title="New item"
      open
      onClose={onClose}
      footer={
        <button
          type="button"
          className="primary"
          disabled={name.trim() === ''}
          onClick={() => {
            onCreate({ name: name.trim(), description, count });
            onClose();
          }}
        >
          Create
        </button>
      }
    >
      <label className="dlabel" htmlFor="new-item-name">
        Name
      </label>
      <input
        id="new-item-name"
        className="inp"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <div className="mt12">
        <span className="dlabel">Count</span>
        <NumberField label="Count" className="inp" value={count} onChange={setCount} />
      </div>
      <label className="dlabel mt12" htmlFor="new-item-description">
        Description
      </label>
      <textarea
        id="new-item-description"
        className="area"
        rows={4}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
    </ResponsiveDialog>
  );
}

function EditItemDialog({
  item,
  actions,
  onClose,
}: {
  item: InventoryItemView;
  actions: InventoryActions;
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
            actions.removeItem(item.id);
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
        onCommit={(name) => actions.renameItem(item.id, name)}
      />
      <div className="mt12">
        <span className="dlabel">Count</span>
        <NumberField
          label="Count"
          className="inp"
          value={item.count}
          onChange={(value) => actions.setItemCount(item.id, value)}
        />
      </div>
      <label className="dlabel mt12" htmlFor="item-description">
        Description
      </label>
      <textarea
        id="item-description"
        className="area"
        rows={4}
        value={item.description}
        onChange={(event) => actions.setItemDescription(item.id, event.target.value)}
      />
    </ResponsiveDialog>
  );
}
