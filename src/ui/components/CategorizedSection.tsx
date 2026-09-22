import { Fragment, useState, type ReactNode } from 'react';
import { AddByName } from './AddByName.js';
import { NameField } from './NameField.js';
import { ResponsiveDialog } from './ResponsiveDialog.js';
import type { CategoryActions, CategorizedView, CategoryView } from '../types.js';

interface Props<T> {
  title: string;
  data: CategorizedView<T>;
  actions: CategoryActions;
  /** Back to the hub grid. */
  onClose(): void;
  /** One row per item. The section owns its row, because only it knows what an item shows. */
  renderRow(item: T): ReactNode;
  /** Open the section's own "new item" dialog, in this category (`null` = Uncategorized). */
  onAdd(categoryId: string | null): void;
  /** Rendered between the header and the first category — spell slots, for Counters. */
  children?: ReactNode;
}

/**
 * The category machinery shared by Feats & Traits, Spell List and Counters: the collapsible
 * blocks, the Uncategorized block, the rename/delete dialog and the new-category dialog.
 *
 * All three are one `Categorized<T>` in the document and one `CategorizedBO` in the business
 * layer, so they are one component here. What differs between them is a row's contents and what
 * its edit dialog contains — which is exactly what `renderRow` and `onAdd` leave to the caller.
 */
export function CategorizedSection<T extends { id: string }>({
  title,
  data,
  actions,
  onClose,
  renderRow,
  onAdd,
  children,
}: Props<T>) {
  // Keyed by category id, plus the literal 'uncategorized'. Collapse is view state and is
  // deliberately not persisted: which blocks you had folded is not part of the character.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));

  const [dialog, setDialog] = useState<{ kind: 'edit'; id: string } | { kind: 'new' } | null>(null);
  const close = () => setDialog(null);
  // Resolved here rather than inside the dialog, so a category that vanishes underneath it —
  // a raw-JSON commit rebuilds the whole sheet — simply unmounts it.
  const editing =
    dialog?.kind === 'edit' ? data.categories.find((entry) => entry.id === dialog.id) : undefined;

  return (
    <div className="bottom">
      <div className="sv">
        <div className="svhead">
          <span className="t">{title}</span>
          <button type="button" className="close" onClick={onClose} aria-label="Back to sections">
            {'×'}
          </button>
        </div>

        {children}

        {data.categories.map((category) => (
          <Block
            key={category.id}
            name={category.name}
            items={category.items}
            renderRow={renderRow}
            collapsed={collapsed[category.id] === true}
            onToggle={() => toggle(category.id)}
            onAdd={() => onAdd(category.id)}
            onEditCategory={() => setDialog({ kind: 'edit', id: category.id })}
          />
        ))}

        <Block
          name="Uncategorized"
          items={data.uncategorized}
          renderRow={renderRow}
          collapsed={collapsed.uncategorized === true}
          onToggle={() => toggle('uncategorized')}
          onAdd={() => onAdd(null)}
        />

        <button type="button" className="newcat" onClick={() => setDialog({ kind: 'new' })}>
          + New category
        </button>
      </div>

      {editing && <CategoryDialog category={editing} actions={actions} onClose={close} />}
      {dialog?.kind === 'new' && (
        <ResponsiveDialog title="New category" open onClose={close}>
          <AddByName
            label="Category name"
            placeholder="e.g. Rogue"
            button="Create"
            onAdd={(name) => {
              const failure = actions.createCategory(name);
              if (failure === null) close();
              return failure;
            }}
          />
        </ResponsiveDialog>
      )}
    </div>
  );
}

interface BlockProps<T> {
  name: string;
  items: T[];
  renderRow(item: T): ReactNode;
  collapsed: boolean;
  onToggle(): void;
  onAdd(): void;
  /** Absent for Uncategorized, which is not a category and cannot be renamed or deleted. */
  onEditCategory?: () => void;
}

function Block<T extends { id: string }>({
  name,
  items,
  renderRow,
  collapsed,
  onToggle,
  onAdd,
  onEditCategory,
}: BlockProps<T>) {
  return (
    <>
      <div className="sechead-row">
        <button type="button" className="sechead" onClick={onToggle} aria-expanded={!collapsed}>
          <span className="caret" aria-hidden="true">
            {collapsed ? '▸' : '▾'}
          </span>
          <span className="nmtxt">{name}</span>
          {collapsed && <span className="ccount">{items.length}</span>}
        </button>
        <span className="sec-actions">
          {onEditCategory && (
            <button
              type="button"
              className="editcat"
              onClick={onEditCategory}
              aria-label={`Edit category ${name}`}
            >
              {'✎'}
            </button>
          )}
          <button
            type="button"
            className="addmini"
            onClick={onAdd}
            aria-label={`Add entry to ${name}`}
          >
            +
          </button>
        </span>
      </div>
      {!collapsed &&
        (items.length === 0 ? (
          <div className="empty">Nothing here yet</div>
        ) : (
          items.map((item) => <Fragment key={item.id}>{renderRow(item)}</Fragment>)
        ))}
    </>
  );
}

function CategoryDialog<T>({
  category,
  actions,
  onClose,
}: {
  category: CategoryView<T>;
  actions: CategoryActions;
  onClose(): void;
}) {
  const count = category.items.length;

  return (
    <ResponsiveDialog
      title="Category"
      open
      onClose={onClose}
      footer={
        <button
          type="button"
          className="del"
          onClick={() => {
            actions.removeCategory(category.id);
            onClose();
          }}
        >
          Delete category
        </button>
      }
    >
      <span className="dlabel">Category name</span>
      <NameField
        label="Category name"
        value={category.name}
        onCommit={(name) => actions.renameCategory(category.id, name)}
      />
      {count > 0 && (
        <div className="hint">
          Deleting moves its {count === 1 ? '1 entry' : `${count} entries`} to Uncategorized.
        </div>
      )}
    </ResponsiveDialog>
  );
}
