import { createId } from './createId.js';
import { RuleViolation } from './errors.js';
import { trimmedName } from './guards.js';
import { NamedItemBO, type NamedItemData } from './namedItem.js';
import { pushAndRead } from './observableList.js';

export interface CategoryData<TData> {
  id: string;
  name: string;
  items: TData[];
}

export interface CategorizedData<TData> {
  categories: CategoryData<TData>[];
  uncategorized: TData[];
}

export interface NewNamedItem {
  name: string;
  description?: string;
}

/**
 * An item that lives inside a `Categorized` shape and can move between its buckets. `moveTo`
 * keeps `categories` and `uncategorized` mutually exclusive: it splices out of the current home
 * before pushing into the new one, so an item is never in two places and never in none.
 */
export abstract class CategorizedItemBO<TData extends NamedItemData> extends NamedItemBO<TData> {
  readonly #owner: CategorizedData<TData>;

  constructor(node: TData, siblings: TData[], owner: CategorizedData<TData>) {
    super(node, siblings);
    this.#owner = owner;
  }

  /**
   * Takes the structural target rather than `CategoryBO<TData, TItemBO>`, because this class
   * knows its data type but not which business object wraps it — naming `CategoryBO` here would
   * need a second type parameter that exists only to be passed straight back.
   */
  moveTo(category: CategoryTarget<TData> | null): void {
    const destination = category === null ? this.#owner.uncategorized : category.rawItems;
    if (destination === this.siblings) return;

    super.remove();
    destination.push(this.node);
    // Repoint, or a later remove() would search the bucket this item just left.
    this.siblings = destination;
  }
}

/** What `moveTo` needs of a destination: somewhere to splice the node into. */
export interface CategoryTarget<TData> {
  readonly rawItems: TData[];
}

type Make<TData extends NamedItemData, TItemBO> = (
  node: TData,
  siblings: TData[],
  owner: CategorizedData<TData>,
) => TItemBO;

export class CategorizedBO<TData extends NamedItemData, TItemBO> {
  readonly #node: CategorizedData<TData>;
  readonly #make: Make<TData, TItemBO>;
  readonly #fill: (init: NewNamedItem) => TData;

  constructor(
    node: CategorizedData<TData>,
    make: Make<TData, TItemBO>,
    fill: (init: NewNamedItem) => TData,
  ) {
    this.#node = node;
    this.#make = make;
    this.#fill = fill;
  }

  get categories(): CategoryBO<TData, TItemBO>[] {
    return this.#node.categories.map(
      (category) => new CategoryBO(category, this.#node, this.#make, this.#fill),
    );
  }

  get uncategorized(): TItemBO[] {
    return this.#node.uncategorized.map((item) =>
      this.#make(item, this.#node.uncategorized, this.#node),
    );
  }

  createCategory(name: string): CategoryBO<TData, TItemBO> {
    const trimmed = trimmedName(name);
    rejectDuplicateCategory(this.#node.categories, trimmed, null);

    // A fresh plain literal, so it must go through pushAndRead: MobX clones it on push, and the
    // CategoryBO below must wrap the stored clone, not the detached literal.
    const category = pushAndRead(this.#node.categories, {
      id: createId(),
      name: trimmed,
      items: [],
    });
    return new CategoryBO(category, this.#node, this.#make, this.#fill);
  }

  /** New items land in `uncategorized`; the player files them afterwards. */
  add(init: NewNamedItem): TItemBO {
    const node = pushAndRead(this.#node.uncategorized, this.#fill(init));
    return this.#make(node, this.#node.uncategorized, this.#node);
  }
}

export class CategoryBO<TData extends NamedItemData, TItemBO> {
  readonly #node: CategoryData<TData>;
  readonly #owner: CategorizedData<TData>;
  readonly #make: Make<TData, TItemBO>;
  readonly #fill: (init: NewNamedItem) => TData;

  constructor(
    node: CategoryData<TData>,
    owner: CategorizedData<TData>,
    make: Make<TData, TItemBO>,
    fill: (init: NewNamedItem) => TData,
  ) {
    this.#node = node;
    this.#owner = owner;
    this.#make = make;
    this.#fill = fill;
  }

  get id(): string {
    return this.#node.id;
  }

  get name(): string {
    return this.#node.name;
  }

  /** A plain field write. Array position is the display order, so a rename cannot move it. */
  setName(value: string): void {
    const trimmed = trimmedName(value);
    this.#require();
    rejectDuplicateCategory(this.#owner.categories, trimmed, this.#node);
    this.#node.name = trimmed;
  }

  get items(): TItemBO[] {
    return this.#node.items.map((item) => this.#make(item, this.#node.items, this.#owner));
  }

  /** The raw array, so `moveTo` can splice into it. Not part of the UI-facing surface. */
  get rawItems(): TData[] {
    return this.#node.items;
  }

  add(init: NewNamedItem): TItemBO {
    const node = pushAndRead(this.#node.items, this.#fill(init));
    return this.#make(node, this.#node.items, this.#owner);
  }

  /** Rehomes the category's items before deleting it — removing a category is not a bulk delete. */
  remove(): void {
    const index = this.#require();
    this.#owner.uncategorized.push(...this.#node.items);
    this.#owner.categories.splice(index, 1);
  }

  #require(): number {
    const index = this.#owner.categories.indexOf(this.#node);
    if (index === -1) {
      throw new RuleViolation('GONE', `the category "${this.#node.name}" is no longer present`);
    }
    return index;
  }
}

function rejectDuplicateCategory<TData>(
  categories: readonly CategoryData<TData>[],
  name: string,
  except: CategoryData<TData> | null,
) {
  if (categories.some((entry) => entry !== except && entry.name === name)) {
    throw new RuleViolation('DUPLICATE_NAME', `a category named "${name}" already exists`);
  }
}
