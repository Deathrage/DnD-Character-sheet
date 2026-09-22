import type { CategorizedView, CategoryView } from '../types.js';

/**
 * The category `<select>` and the lookup behind it, shared by the three categorized sections'
 * item dialogs. `null` means Uncategorized here and everywhere else in the UI — never "nothing
 * chosen", which is not a state the document has.
 */
export function CategorySelect<T>({
  value,
  categories,
  onChange,
}: {
  value: string | null;
  categories: CategoryView<T>[];
  onChange(id: string | null): void;
}) {
  return (
    <>
      <label className="dlabel mt12" htmlFor="item-category">
        Category
      </label>
      <select
        id="item-category"
        className="inp"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
      >
        <option value="">Uncategorized</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
    </>
  );
}

export interface Located<T> {
  item: T;
  categoryId: string | null;
}

/**
 * The item plus the category holding it. Returns `undefined` when the item is gone, so the
 * caller unmounts its dialog rather than rendering against something that no longer exists.
 */
export function locate<T extends { id: string }>(
  data: CategorizedView<T>,
  id: string,
): Located<T> | undefined {
  for (const category of data.categories) {
    const item = category.items.find((entry) => entry.id === id);
    if (item) return { item, categoryId: category.id };
  }
  const item = data.uncategorized.find((entry) => entry.id === id);
  return item ? { item, categoryId: null } : undefined;
}
