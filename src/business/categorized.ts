import { createId } from './createId.js';
import { RuleViolation } from './errors.js';
import { rejectDuplicate, trimmedName } from './guards.js';
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
 * `CategoryBO`'s live items array, keyed by the `CategoryBO` instance that owns it. Registered by
 * `CategoryBO`'s own constructor below and read only by `rawItemsOf`, so that `moveTo` — a method
 * on a *different* class — can splice into a category's storage without that storage ever being a
 * public property. `CategoryBO` used to expose it as a `rawItems` getter "for `moveTo`", but a
 * public getter returning the live array is a public door straight into the document: any caller
 * holding a category could push a raw, untrimmed, un-deduplicated, id-less item straight into
 * `toDocument()`'s source, bypassing every rule this layer exists to enforce. A `#` private field
 * cannot fix this — `moveTo` lives in `CategorizedItemBO`, a different class, and hard-private
 * fields are invisible outside the class body that declares them, even to another class in the
 * same module. A module-scoped, never-exported `WeakMap` is: it is reachable from any code in this
 * file, and from nowhere outside it.
 */
const rawItemsByCategory = new WeakMap<object, unknown[]>();

function rawItemsOf<TData extends NamedItemData>(category: CategoryBO<TData, unknown>): TData[] {
  const items = rawItemsByCategory.get(category);
  if (items === undefined) {
    throw new Error('unreachable: every CategoryBO registers its items array in its constructor');
  }
  return items as TData[];
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
   * Takes a `CategoryBO<TData, unknown>` rather than adding a second type parameter to `moveTo`
   * itself purely to be passed straight back — this class knows its data type but has no reason
   * to also care which business object wraps each item, so `unknown` stands in for it. The
   * destination's live array is never touched directly; it is looked up through `rawItemsOf`,
   * which only this module can call.
   */
  moveTo(category: CategoryBO<TData, unknown> | null): void {
    let destination: TData[];
    if (category === null) {
      destination = this.#owner.uncategorized;
    } else {
      destination = rawItemsOf(category);
      if (!this.#owner.categories.some((entry) => entry.items === destination)) {
        throw new RuleViolation('UNKNOWN_CATEGORY', 'that category is no longer in the document');
      }
    }

    const home = this.#home();
    if (home === destination) return;

    home.splice(home.indexOf(this.node), 1);
    destination.push(this.node);
    // Repoint, or a later remove() would search the bucket this item just left.
    this.siblings = destination;
  }

  /** Same resolution as `moveTo`: splicing the cached `siblings` can splice an orphan. */
  override remove(): void {
    const home = this.#home();
    home.splice(home.indexOf(this.node), 1);
    this.siblings = home;
  }

  /**
   * The bucket this item is in *now*, found by searching the owner rather than by trusting the
   * cached `siblings`. `siblings` goes stale the moment something else rehomes the node behind
   * this object's back — `CategoryBO.remove()` tips its items into `uncategorized`, so an item
   * business object held across that call still points at the orphaned category's array. Acting
   * on that array splices nothing and pushes a node the document already holds, putting the same
   * node in twice: a duplicate id, a document the schema rejects, and autosave stopped for good.
   */
  #home(): TData[] {
    if (this.#owner.uncategorized.includes(this.node)) return this.#owner.uncategorized;
    for (const category of this.#owner.categories) {
      if (category.items.includes(this.node)) return category.items;
    }
    throw new RuleViolation('GONE', 'this item is no longer in the document');
  }
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
    rejectDuplicate(this.#node.categories, trimmed, null, 'category');

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
    // Registered here, not exposed as a getter — see rawItemsByCategory's doc comment above.
    rawItemsByCategory.set(this, node.items);
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
    rejectDuplicate(this.#owner.categories, trimmed, this.#node, 'category');
    this.#node.name = trimmed;
  }

  get items(): TItemBO[] {
    return this.#node.items.map((item) => this.#make(item, this.#node.items, this.#owner));
  }

  add(init: NewNamedItem): TItemBO {
    // Like setName and remove: adding through a removed category would mint an id and hand back
    // a working-looking business object whose item never reaches the document.
    this.#require();
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
