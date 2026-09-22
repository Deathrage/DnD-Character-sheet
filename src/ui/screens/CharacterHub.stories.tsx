import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { noSheetActions, sheetData } from '../fixtures.js';
import type { SectionKey } from '../types.js';
import { CharacterHub } from './CharacterHub.js';

const meta = {
  title: 'Screens/Character hub',
  component: CharacterHub,
  args: {
    data: sheetData,
    actions: noSheetActions,
    section: null,
    onSectionChange: () => {},
    onBack: () => {},
    onExport: () => {},
    onOpenRawJson: () => {},
  },
} satisfies Meta<typeof CharacterHub>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {};

/**
 * The whole sheet, clickable. `section` is controlled so the router can own it; this story
 * supplies the state the router will, which is also the only way to walk the hub in Storybook.
 */
export const Navigable: Story = {
  render: function Navigable(args) {
    const [section, setSection] = useState<SectionKey | null>(null);
    return <CharacterHub {...args} section={section} onSectionChange={setSection} />;
  },
};

/** Criterion 12's original state: only Feats & Traits live, the other six visibly inert. */
export const FirstSliceOnly: Story = {
  render: function FirstSliceOnly(args) {
    const [section, setSection] = useState<SectionKey | null>(null);
    return (
      <CharacterHub
        {...args}
        section={section}
        onSectionChange={setSection}
        wiredSections={['feats']}
      />
    );
  },
};
