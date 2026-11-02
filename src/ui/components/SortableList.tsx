import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, type DOMAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * What makes an element the thing to hold: dnd-kit's pointer listeners, spread onto it. A row
 * takes them on its wrapper; a category block takes them on its header row, so that holding a
 * row inside the block reaches the rows' list and never the categories' (nested `DndContext`s
 * each listen only on their own handles).
 */
export type DragHandle = DOMAttributes<HTMLElement>;

/** A handle that holds nothing: the lifted copy's, and a row's when the wrapper is the handle. */
const NO_HANDLE: DragHandle = {};

/**
 * Hold for this long, moving no further than this, and the drag begins. Shorter is a tap or a
 * click, which still opens the row's dialog; a finger that moves sooner is scrolling the list.
 * The same gesture for touch and mouse, so there is one thing to learn.
 */
const HOLD = { delay: 250, tolerance: 5 } as const;

interface Props<T extends { id: string }> {
  items: readonly T[];
  /** The whole new order, as ids. Called only when something moved. */
  onReorder(ids: string[]): void;
  /** Told when a drag begins and ends; `CategorizedSection` collapses its blocks around one. */
  onDragging?(active: boolean): void;
  /**
   * The whole wrapper is the handle, so `children` need not place it. For rows, where holding
   * anywhere on the row is the gesture. Off, `children` spreads the handle where it belongs.
   */
  wholeItem?: boolean;
  /**
   * One item. Rendered a second time, with an inert handle, as the lifted copy that follows the
   * pointer while the item is held.
   */
  children(item: T, handle: DragHandle): ReactNode;
}

/**
 * A vertical list whose items the player reorders by holding one and dragging it. The one file
 * in `src/ui/` that imports dnd-kit (reorder-by-drag design §4).
 *
 * While an item is held, a copy of it follows the pointer in a `DragOverlay`, the item's own
 * wrapper becomes the skeleton that marks where it will land (dnd-kit moves the held node to its
 * new slot too — checked in the installed `useSortable`: with an overlay, the source is not
 * displaced but still sorted), and the others slide aside. Letting go hands back the ids in
 * their new order. Mouse and touch are separate sensors rather than one pointer sensor, because
 * a pointer sensor needs `touch-action: none` on every row to work on a phone, and that would
 * stop the list scrolling by touching a row; the touch sensor instead lets a move before the
 * hold scroll, and prevents scrolling only once the drag is on.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  onDragging,
  wholeItem = false,
  children,
}: Props<T>) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: HOLD }),
    useSensor(TouchSensor, { activationConstraint: HOLD }),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId === null ? undefined : items.find((item) => item.id === activeId);

  const start = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    onDragging?.(true);
  };
  const stop = () => {
    setActiveId(null);
    onDragging?.(false);
  };
  const end = (event: DragEndEvent) => {
    stop();
    const { over } = event;
    if (over === null || over.id === event.active.id) return;
    const ids = items.map((item) => item.id);
    const from = ids.indexOf(String(event.active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(ids, from, to));
  };

  if (items.length === 0) return null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={start}
      onDragEnd={end}
      onDragCancel={stop}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="sortlist">
          {items.map((item) => (
            <SortableItem key={item.id} id={item.id} wholeItem={wholeItem}>
              {(handle) => children(item, handle)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
      {/* Portaled: the overlay is `position: fixed`, which a transformed ancestor would catch. */}
      {createPortal(
        <DragOverlay className="draglift" dropAnimation={reducedMotion() ? null : undefined}>
          {active === undefined ? null : children(active, NO_HANDLE)}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

function SortableItem({
  id,
  wholeItem,
  children,
}: {
  id: string;
  wholeItem: boolean;
  children(handle: DragHandle): ReactNode;
}) {
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id });
  // The listeners are typed as a record of functions; on an element they are the ordinary
  // `onMouseDown` and `onTouchStart`, which is what `DragHandle` says they are.
  const handle = (listeners ?? NO_HANDLE) as DragHandle;
  return (
    <div
      ref={setNodeRef}
      className={isDragging ? 'sortrow held' : 'sortrow'}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...(wholeItem ? handle : NO_HANDLE)}
    >
      {children(wholeItem ? NO_HANDLE : handle)}
    </div>
  );
}

/** Read when needed rather than once: the setting can change while the app is open. */
function reducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
