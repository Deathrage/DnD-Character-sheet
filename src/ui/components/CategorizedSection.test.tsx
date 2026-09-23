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
