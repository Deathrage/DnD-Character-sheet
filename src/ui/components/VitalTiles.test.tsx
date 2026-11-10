// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { VitalTiles } from './VitalTiles.js';

const actions = {
  setCurrentHitPoints() {},
  setTotalHitPoints() {},
  setTemporaryHitPoints() {},
  setArmorClass() {},
  setInitiative() {},
};

function tiles(props: Partial<Parameters<typeof VitalTiles>[0]> = {}) {
  render(
    <VitalTiles
      hitPoints={{ current: 9, total: 16, temporary: 0 }}
      hitDices={[{ size: 6, current: 2, total: 3 }]}
      armorClass={16}
      initiative={0}
      actions={actions}
      onOpenHitDice={() => {}}
      {...props}
    />,
  );
}

const NAMES = [
  'current hit points',
  'total hit points',
  'temporary hit points',
  'armor class',
  'initiative',
];

describe('VitalTiles', () => {
  it("keeps the character's labels without a prefix", () => {
    tiles();
    for (const name of NAMES) {
      expect(screen.getByLabelText(name.charAt(0).toUpperCase() + name.slice(1))).toBeTruthy();
    }
  });

  it('starts every label with the prefix', () => {
    tiles({ labelPrefix: 'Vestige' });
    for (const name of NAMES) expect(screen.getByLabelText(`Vestige ${name}`)).toBeTruthy();
  });

  it('shows No hit dices, with no button, when hit dice are off', () => {
    tiles({ hitDices: null });
    expect(screen.getByText('No hit dices')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Hit Dices/ })).toBeNull();
  });

  it('shows Uses yours, with no input, when initiative is off', () => {
    tiles({ initiative: null, labelPrefix: 'Vestige' });
    const tile = screen.getByText('Uses yours').closest('.tile')!;
    expect(tile.querySelector('input')).toBeNull();
    expect(screen.queryByLabelText('Vestige initiative')).toBeNull();
  });

  it('names the Hit Dices button by the prefix and the summary', () => {
    const onOpenHitDice = vi.fn();
    tiles({ labelPrefix: 'Vestige', onOpenHitDice });
    fireEvent.click(screen.getByRole('button', { name: 'Vestige Hit Dices 2/3\u00a0d6' }));
    expect(onOpenHitDice).toHaveBeenCalledOnce();
  });
});
