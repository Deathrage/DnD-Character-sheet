import { useState } from 'react';
import { pasteLists } from '../components/pasteLists.js';
import { CategorizedSection } from '../components/CategorizedSection.js';
import { CheckRow } from '../components/CheckRow.js';
import { ConfirmDelete } from '../components/ConfirmDelete.js';
import { ItemRow } from '../components/ItemRow.js';
import { NameField } from '../components/NameField.js';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import { SPELL_LEVELS, spellLevelBadge, spellLevelName } from '../reference.js';
import { CategorySelect, locate, type Located } from './categoryPicker.js';
import type {
  CategoryView,
  SpellListActions,
  SpellListView,
  SpellLevel,
  SpellView,
} from '../types.js';

interface Props {
  data: SpellListView;
  actions: SpellListActions;
  onClose(): void;
}

type Dialog = { kind: 'new'; categoryId: string | null } | { kind: 'edit'; id: string } | null;

export function SpellList({ data, actions, onClose }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const editing = dialog?.kind === 'edit' ? locate(data, dialog.id) : undefined;

  return (
    <>
      <CategorizedSection
        title="Spell List"
        data={data}
        actions={actions}
        onClose={onClose}
        onAdd={(categoryId) => setDialog({ kind: 'new', categoryId })}
        count={(spells) =>
          `${spells.filter((spell) => spell.prepared).length}/${spells.length} prepared`
        }
        renderRow={(spell) => (
          <ItemRow
            name={spell.name}
            description={spell.description}
            dim={!spell.prepared}
            onOpen={() => setDialog({ kind: 'edit', id: spell.id })}
            before={
              // Prepared toggles from the row, not only from the dialog: it is the one field
              // that changes on every long rest, for every spell at once.
              <button
                type="button"
                className={spell.prepared ? 'prep on' : 'prep'}
                aria-pressed={spell.prepared}
                aria-label={`${spell.name} prepared`}
                onClick={() => actions.setSpellPrepared(spell.id, !spell.prepared)}
              />
            }
            after={<span className="lvlbadge">{spellLevelBadge(spell.level)}</span>}
          />
        )}
      />

      {dialog?.kind === 'new' && (
        <NewSpellDialog
          categoryId={dialog.categoryId}
          categories={data.categories}
          onCreate={actions.addSpell}
          onClose={close}
        />
      )}
      {editing && (
        <EditSpellDialog
          located={editing}
          categories={data.categories}
          actions={actions}
          onClose={close}
        />
      )}
    </>
  );
}

function LevelSelect({
  value,
  onChange,
}: {
  value: SpellLevel;
  onChange(level: SpellLevel): void;
}) {
  return (
    <>
      <label className="dlabel" htmlFor="spell-level">
        Level
      </label>
      <select
        id="spell-level"
        className="inp"
        value={String(value)}
        // Round-trips through the string the option carries: `'c'` stays a string and the rest
        // become numbers again, which is the union the schema accepts.
        onChange={(event) =>
          onChange(event.target.value === 'c' ? 'c' : (Number(event.target.value) as SpellLevel))
        }
      >
        {SPELL_LEVELS.map((level) => (
          <option key={String(level)} value={String(level)}>
            {spellLevelName(level)}
          </option>
        ))}
      </select>
    </>
  );
}

function NewSpellDialog({
  categoryId,
  categories,
  onCreate,
  onClose,
}: {
  categoryId: string | null;
  categories: CategoryView<SpellView>[];
  onCreate: SpellListActions['addSpell'];
  onClose(): void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<SpellLevel>('c');
  const [prepared, setPrepared] = useState(false);
  const [target, setTarget] = useState(categoryId);

  return (
    <ResponsiveDialog
      title="New spell"
      open
      onClose={onClose}
      footer={
        <button
          type="button"
          className="primary"
          disabled={name.trim() === ''}
          onClick={() => {
            onCreate(target, { name: name.trim(), description, level, prepared });
            onClose();
          }}
        >
          Create
        </button>
      }
    >
      <label className="dlabel" htmlFor="new-spell-name">
        Name
      </label>
      <input
        id="new-spell-name"
        className="inp"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <label className="dlabel mt12" htmlFor="new-spell-description">
        Description
      </label>
      <textarea
        onPaste={pasteLists}
        id="new-spell-description"
        className="area"
        rows={4}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <div className="row2">
        <div className="col">
          <LevelSelect value={level} onChange={setLevel} />
        </div>
        <div className="col">
          <CategorySelect value={target} categories={categories} onChange={setTarget} />
        </div>
      </div>
      <CheckRow label="Prepared" checked={prepared} onChange={setPrepared} />
    </ResponsiveDialog>
  );
}

function EditSpellDialog({
  located,
  categories,
  actions,
  onClose,
}: {
  located: Located<SpellView>;
  categories: CategoryView<SpellView>[];
  actions: SpellListActions;
  onClose(): void;
}) {
  const { item: spell, categoryId } = located;

  return (
    <ResponsiveDialog
      title="Edit spell"
      open
      onClose={onClose}
      footer={
        <ConfirmDelete
          what={spell.name}
          onConfirm={() => {
            actions.removeSpell(spell.id);
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
        value={spell.name}
        onCommit={(name) => actions.renameSpell(spell.id, name)}
      />
      <label className="dlabel mt12" htmlFor="spell-description">
        Description
      </label>
      <textarea
        onPaste={pasteLists}
        id="spell-description"
        className="area"
        rows={4}
        value={spell.description}
        onChange={(event) => actions.setSpellDescription(spell.id, event.target.value)}
      />
      <div className="row2">
        <div className="col">
          <LevelSelect
            value={spell.level}
            onChange={(level) => actions.setSpellLevel(spell.id, level)}
          />
        </div>
        <div className="col">
          <CategorySelect
            value={categoryId}
            categories={categories}
            onChange={(id) => actions.moveSpell(spell.id, id)}
          />
        </div>
      </div>
      <CheckRow
        label="Prepared"
        checked={spell.prepared}
        onChange={(prepared) => actions.setSpellPrepared(spell.id, prepared)}
      />
    </ResponsiveDialog>
  );
}
