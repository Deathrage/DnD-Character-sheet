import { useState } from 'react';
import { pasteLists } from '../components/pasteLists.js';
import { CategorizedSection } from '../components/CategorizedSection.js';
import { ConfirmDelete } from '../components/ConfirmDelete.js';
import { ItemRow } from '../components/ItemRow.js';
import { NameField } from '../components/NameField.js';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import { CategorySelect, locate, type Located } from './categoryPicker.js';
import type {
  CategoryView,
  FeatsAndTraitsActions,
  FeatsAndTraitsView,
  FeatView,
} from '../types.js';

interface Props {
  data: FeatsAndTraitsView;
  actions: FeatsAndTraitsActions;
  onClose(): void;
}

type Dialog = { kind: 'new'; categoryId: string | null } | { kind: 'edit'; id: string } | null;

export function FeatsAndTraits({ data, actions, onClose }: Props) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = () => setDialog(null);
  const editing = dialog?.kind === 'edit' ? locate(data, dialog.id) : undefined;

  return (
    <>
      <CategorizedSection
        title="Feats & Traits"
        data={data}
        actions={actions}
        onClose={onClose}
        onAdd={(categoryId) => setDialog({ kind: 'new', categoryId })}
        renderRow={(feat) => (
          <ItemRow
            name={feat.name}
            description={feat.description}
            onOpen={() => setDialog({ kind: 'edit', id: feat.id })}
          />
        )}
      />

      {dialog?.kind === 'new' && (
        <NewFeatDialog
          categoryId={dialog.categoryId}
          categories={data.categories}
          onCreate={actions.addFeat}
          onClose={close}
        />
      )}
      {editing && (
        <EditFeatDialog
          located={editing}
          categories={data.categories}
          actions={actions}
          onClose={close}
        />
      )}
    </>
  );
}

/**
 * Creation collects the whole entry before anything exists, because `add` needs a name the
 * business layer will accept — there is no blank entry to fill in afterwards.
 */
function NewFeatDialog({
  categoryId,
  categories,
  onCreate,
  onClose,
}: {
  categoryId: string | null;
  categories: CategoryView<FeatView>[];
  onCreate: FeatsAndTraitsActions['addFeat'];
  onClose(): void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState(categoryId);

  return (
    <ResponsiveDialog
      title="New entry"
      open
      onClose={onClose}
      footer={
        <button
          type="button"
          className="primary"
          disabled={name.trim() === ''}
          onClick={() => {
            onCreate(target, { name: name.trim(), description });
            onClose();
          }}
        >
          Create
        </button>
      }
    >
      <label className="dlabel" htmlFor="new-feat-name">
        Name
      </label>
      <input
        id="new-feat-name"
        className="inp"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <label className="dlabel mt12" htmlFor="new-feat-description">
        Description
      </label>
      <textarea
        onPaste={pasteLists}
        id="new-feat-description"
        className="area"
        rows={4}
        value={description}
        onChange={(event) => setDescription(event.target.value)}
      />
      <CategorySelect value={target} categories={categories} onChange={setTarget} />
    </ResponsiveDialog>
  );
}

/**
 * Editing writes straight through, per spec §7 — autosave's debounce absorbs the keystroke
 * rate. The name is the exception, for the reason spec §6 gives about category rename: a setter
 * that rejects an empty or duplicate name cannot be called on every keystroke. See `NameField`.
 */
function EditFeatDialog({
  located,
  categories,
  actions,
  onClose,
}: {
  located: Located<FeatView>;
  categories: CategoryView<FeatView>[];
  actions: FeatsAndTraitsActions;
  onClose(): void;
}) {
  const { item: feat, categoryId } = located;

  return (
    <ResponsiveDialog
      title="Edit entry"
      open
      onClose={onClose}
      footer={
        <ConfirmDelete
          what={feat.name}
          onConfirm={() => {
            actions.removeFeat(feat.id);
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
        value={feat.name}
        onCommit={(name) => actions.renameFeat(feat.id, name)}
      />
      <label className="dlabel mt12" htmlFor="feat-description">
        Description
      </label>
      <textarea
        onPaste={pasteLists}
        id="feat-description"
        className="area"
        rows={4}
        value={feat.description}
        onChange={(event) => actions.setFeatDescription(feat.id, event.target.value)}
      />
      <CategorySelect
        value={categoryId}
        categories={categories}
        onChange={(id) => actions.moveFeat(feat.id, id)}
      />
    </ResponsiveDialog>
  );
}
