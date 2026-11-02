// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { describe, expect, it, vi } from 'vitest';
import { SortableList } from './SortableList.js';

/**
 * dnd-kit's sensors need layout — rects, pointer coordinates, a hold timer — and jsdom has none,
 * so the drag itself is checked in a browser (reorder-by-drag design §6). What is checked here is
 * everything around it: the list, the handle, and what a drop hands back. The `DndContext` is
 * mocked to a pass-through that exposes its `onDragStart`/`onDragEnd`, so a drop can be fed in.
 */
const hooks: {
  start?: ((event: DragStartEvent) => void) | undefined;
  end?: ((event: DragEndEvent) => void) | undefined;
} = {};
/** The real `DndContext` for the one test that needs the sensors' listeners to exist. */
let real = false;

vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>();
  type ContextProps = React.ComponentProps<typeof actual.DndContext>;
  const PassThrough = (props: ContextProps) => {
    hooks.start = props.onDragStart;
    hooks.end = props.onDragEnd;
    return <>{props.children}</>;
  };
  return {
    ...actual,
    DndContext: (props: ContextProps) =>
      real ? <actual.DndContext {...props} /> : <PassThrough {...props} />,
  };
});

const items = [
  { id: 'a', name: 'Rage' },
  { id: 'b', name: 'Reckless Attack' },
  { id: 'c', name: 'Danger Sense' },
];

/** `active` and `over` as dnd-kit hands them: only the ids matter to `SortableList`. */
const drop = (activeId: string, overId: string | null) =>
  ({
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  }) as unknown as DragEndEvent;

describe('SortableList', () => {
  it('renders every item once, in order, each inside a sortable wrapper', () => {
    const { container } = render(
      <SortableList items={items} onReorder={() => {}}>
        {(item) => <span>{item.name}</span>}
      </SortableList>,
    );
    const rows = [...container.querySelectorAll('.sortrow')];
    expect(rows.map((row) => row.textContent)).toEqual(['Rage', 'Reckless Attack', 'Danger Sense']);
  });

  it('renders nothing at all for no items', () => {
    const { container } = render(
      <SortableList items={[]} onReorder={() => {}}>
        {(item: { id: string }) => <span>{item.id}</span>}
      </SortableList>,
    );
    expect(container.innerHTML).toBe('');
  });

  it('hands back the whole new order when an item is dropped on another', () => {
    const onReorder = vi.fn();
    render(
      <SortableList items={items} onReorder={onReorder}>
        {(item) => <span>{item.name}</span>}
      </SortableList>,
    );

    act(() => hooks.end?.(drop('a', 'c')));

    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a']);
  });

  it('hands back nothing when the item is dropped where it was, or nowhere', () => {
    const onReorder = vi.fn();
    render(
      <SortableList items={items} onReorder={onReorder}>
        {(item) => <span>{item.name}</span>}
      </SortableList>,
    );

    act(() => hooks.end?.(drop('b', 'b')));
    act(() => hooks.end?.(drop('b', null)));

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('tells the owner when a drag is on and when it is over', () => {
    const onDragging = vi.fn();
    render(
      <SortableList items={items} onReorder={() => {}} onDragging={onDragging}>
        {(item) => <span>{item.name}</span>}
      </SortableList>,
    );

    act(() => hooks.start?.({ active: { id: 'a' } } as unknown as DragStartEvent));
    expect(onDragging).toHaveBeenLastCalledWith(true);
    act(() => hooks.end?.(drop('a', 'a')));
    expect(onDragging).toHaveBeenLastCalledWith(false);
  });

  it('gives the handle to the wrapper, or to the child, as asked', () => {
    real = true;
    const seen: object[] = [];
    const { container, rerender } = render(
      <SortableList items={items} onReorder={() => {}}>
        {(item, handle) => {
          seen.push(handle);
          return <span>{item.name}</span>;
        }}
      </SortableList>,
    );
    // The child places it: dnd-kit's mouse and touch listeners are in the handle it was given.
    expect(Object.keys(seen[0] ?? {})).toEqual(
      expect.arrayContaining(['onMouseDown', 'onTouchStart']),
    );

    seen.length = 0;
    rerender(
      <SortableList items={items} onReorder={() => {}} wholeItem>
        {(item, handle) => {
          seen.push(handle);
          return <span>{item.name}</span>;
        }}
      </SortableList>,
    );
    // The wrapper is the handle, so the child gets none.
    expect(seen[0]).toEqual({});
    expect(screen.getByText('Rage').closest('.sortrow')).not.toBeNull();
    expect(container.querySelectorAll('.sortrow')).toHaveLength(3);
    real = false;
  });
});
