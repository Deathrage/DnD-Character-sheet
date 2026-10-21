// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { stubDialogElement } from '../../test/stubDialog.js';
import { CategorizedSection } from './CategorizedSection.js';

const noop = () => null;
const actions = { createCategory: noop, renameCategory: noop, removeCategory: () => {} };
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
