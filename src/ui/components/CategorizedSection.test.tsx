// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { stubDialogElement } from '../../test/stubDialog.js';
import { CategorizedSection } from './CategorizedSection.js';

const noop = () => null;
const actions = {
  createCategory: noop,
  renameCategory: noop,
  removeCategory: () => {},
  reorderCategories: () => {},
  reorderItems: () => {},
};
const data = {
  categories: [{ id: 'c1', name: 'Rogue', items: [{ id: 'a', name: 'Sneak Attack' }] }],
  uncategorized: [{ id: 'b', name: 'Darkvision' }],
};

describe('CategorizedSection', () => {
  it('starts categories collapsed, and Uncategorized open with no toggle', () => {
    render(
      <CategorizedSection
        characterId="c"
        title="Feats"
        data={data}
        actions={actions}
        onClose={() => {}}
        onAdd={() => {}}
        renderRow={(item) => <div>{item.name}</div>}
      />,
    );

    expect(screen.queryByText('Sneak Attack')).toBeNull();
    expect(screen.getByText('Darkvision')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Uncategorized' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Rogue/ }));
    expect(screen.getByText('Sneak Attack')).toBeTruthy();
  });

  it("shows each block's count whether collapsed or expanded", () => {
    render(
      <CategorizedSection
        characterId="c"
        title="Feats"
        data={data}
        actions={actions}
        onClose={() => {}}
        onAdd={() => {}}
        renderRow={(item) => <div>{item.name}</div>}
        count={(items) => `n=${items.length}`}
      />,
    );

    const rogue = screen.getByRole('button', { name: /^Rogue/ });
    expect(rogue.textContent).toContain('n=1');
    fireEvent.click(rogue);
    expect(rogue.textContent).toContain('n=1');
    expect(screen.getAllByText('n=1')).toHaveLength(2); // Rogue and Uncategorized
  });
});

describe('CategorizedSection deleting a category', () => {
  beforeAll(stubDialogElement);

  const confirmFor = (categories: typeof data.categories) => {
    render(
      <CategorizedSection
        characterId="c"
        title="Feats"
        data={{ ...data, categories }}
        actions={actions}
        onClose={() => {}}
        onAdd={() => {}}
        renderRow={(item) => <div>{item.name}</div>}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit category Rogue' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete category', hidden: true }));
    return screen.getByRole('dialog', { name: 'Delete?', hidden: true }).textContent;
  };

  it('says where the entries go when there are some', () => {
    const items = [
      { id: 'a', name: 'Sneak Attack' },
      { id: 'c', name: 'Cunning Action' },
    ];
    expect(confirmFor([{ id: 'c1', name: 'Rogue', items }])).toContain(
      'The category Rogue will be deleted. Its 2 entries will move to Uncategorized. ' +
        'This cannot be undone.',
    );
  });

  it('says "1 entry" for one', () => {
    expect(confirmFor(data.categories)).toContain('Its 1 entry will move to Uncategorized.');
  });

  it('says nothing about entries when there are none', () => {
    expect(confirmFor([{ id: 'c1', name: 'Rogue', items: [] }])).toContain(
      'The category Rogue will be deleted. This cannot be undone.',
    );
  });
});

describe('CategorizedSection remembers what was open', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  const section = (characterId: string) => (
    <CategorizedSection
      characterId={characterId}
      title="Feats"
      data={data}
      actions={actions}
      onClose={() => {}}
      onAdd={() => {}}
      renderRow={(item) => <div>{item.name}</div>}
    />
  );

  it('across a remount, for the same character only', () => {
    const { unmount } = render(section('c'));
    fireEvent.click(screen.getByRole('button', { name: /^Rogue/ }));
    unmount();

    // A clone keeps its category ids, so the key has to carry the character.
    const other = render(section('clone'));
    expect(screen.queryByText('Sneak Attack')).toBeNull();
    other.unmount();

    render(section('c'));
    expect(screen.getByText('Sneak Attack')).toBeTruthy();
  });

  it('falls back to collapsed when the stored value is not a record', () => {
    localStorage.setItem('ui:c:expanded', 'null');
    render(section('c'));
    expect(screen.queryByText('Sneak Attack')).toBeNull();
  });

  it('still toggles when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    // jsdom reports a throwing listener to `window` rather than out of `fireEvent`.
    const uncaught = vi.fn((event: Event) => event.preventDefault());
    window.addEventListener('error', uncaught);
    render(section('c'));
    fireEvent.click(screen.getByRole('button', { name: /^Rogue/ }));
    window.removeEventListener('error', uncaught);

    expect(uncaught).not.toHaveBeenCalled();
    expect(screen.getByText('Sneak Attack')).toBeTruthy();
  });
});

// Reordering by drag (2026-11-02). The drag itself needs a browser; what jsdom can check is where
// the handles are and what a category drag does to the blocks.
describe('CategorizedSection reordering', () => {
  beforeEach(() => localStorage.clear());

  const two = {
    categories: [
      { id: 'c1', name: 'Rogue', items: [{ id: 'a', name: 'Sneak Attack' }] },
      { id: 'c2', name: 'Wizard', items: [{ id: 'w', name: 'Arcane Recovery' }] },
    ],
    uncategorized: [
      { id: 'b', name: 'Darkvision' },
      { id: 'd', name: 'Lucky' },
    ],
  };
  const section = () =>
    render(
      <CategorizedSection
        characterId="c"
        title="Feats"
        data={two}
        actions={actions}
        onClose={() => {}}
        onAdd={() => {}}
        renderRow={(item) => <div className="rec">{item.name}</div>}
      />,
    );

  /**
   * After the drop, dnd-kit keeps a click-swallowing listener on the document for 50 ms (checked
   * in the installed `AbstractPointerSensor.detach`) so the click that ends a mouse drag opens
   * nothing. On the fake clock that timeout must be run, or it outlives the test and swallows
   * the next test's clicks.
   */
  const letGo = () => {
    act(() => {
      vi.advanceTimersByTime(100);
    });
    vi.useRealTimers();
  };

  it('puts every category block, and every row, inside a sortable wrapper', () => {
    const { container } = section();
    const header = (name: string) =>
      screen.getByRole('button', { name: new RegExp(`^${name}`) }).closest('.sechead-row');

    expect(header('Rogue')?.closest('.sortrow')).not.toBeNull();
    expect(header('Wizard')?.closest('.sortrow')).not.toBeNull();
    // Uncategorized is not a category: it stays last and is not in the list.
    expect(screen.getByText('Uncategorized').closest('.sortrow')).toBeNull();
    expect(screen.getByText('Darkvision').closest('.sortrow')).not.toBeNull();
    // Two lists: the categories', and Uncategorized's rows'. Collapsed blocks render no rows.
    expect(container.querySelectorAll('.sortlist')).toHaveLength(2);
  });

  it('collapses every block while a category is held, and opens them again after', () => {
    section();
    fireEvent.click(screen.getByRole('button', { name: /^Rogue/ }));
    expect(screen.getByText('Sneak Attack')).toBeTruthy();

    // A hold on the header row: dnd-kit's mouse sensor activates after the delay.
    vi.useFakeTimers();
    const header = screen.getByRole('button', { name: /^Rogue/ }).closest('.sechead-row')!;
    fireEvent.mouseDown(header, { button: 0, clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText('Sneak Attack')).toBeNull();
    expect(screen.queryByText('Darkvision')).toBeNull();

    fireEvent.mouseUp(header);
    letGo();
    expect(screen.getByText('Sneak Attack')).toBeTruthy();
    expect(screen.getByText('Darkvision')).toBeTruthy();
  });

  it('a hold on a row lifts a copy of it and collapses nothing', async () => {
    // Reduced motion: no drop animation, so letting go removes the lifted copy at once. jsdom
    // has no matchMedia; with one, the copy would stay until an animation jsdom cannot run.
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    section();
    fireEvent.click(screen.getByRole('button', { name: /^Wizard/ }));
    vi.useFakeTimers();
    const row = screen.getByText('Darkvision');
    fireEvent.mouseDown(row, { button: 0, clientX: 10, clientY: 10 });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    // The row itself, now the skeleton, and the lifted copy in the overlay.
    expect(screen.getAllByText('Darkvision')).toHaveLength(2);
    expect(row.closest('.sortrow')?.classList.contains('held')).toBe(true);
    expect(screen.getByText('Lucky')).toBeTruthy();
    expect(screen.getByText('Arcane Recovery')).toBeTruthy();

    fireEvent.mouseUp(row);
    letGo();
    // The copy goes once the (absent) drop animation has resolved: a microtask later.
    await act(async () => {});
    expect(screen.getAllByText('Darkvision')).toHaveLength(1);
    expect(row.closest('.sortrow')?.classList.contains('held')).toBe(false);
    vi.unstubAllGlobals();
  });
});
