// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
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
