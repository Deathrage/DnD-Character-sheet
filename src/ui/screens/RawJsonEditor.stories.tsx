import type { Meta, StoryObj } from '@storybook/react-vite';
import { sableJson } from '../fixtures.js';
import type { NameResult } from '../types.js';
import { RawJsonEditor } from './RawJsonEditor.js';

const meta = {
  title: 'Screens/Raw JSON editor',
  component: RawJsonEditor,
  args: { text: sableJson, onCommit: (): NameResult => null, onClose: () => {} },
} satisfies Meta<typeof RawJsonEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};

/** Criterion 9, syntax half: the position is named, and the text is left alone. */
export const SyntaxError: Story = {
  args: {
    text: sableJson.replace('"armorClass": 15', '"armorClass": 15,'),
    onCommit: () => 'Unexpected token } in JSON at position 612 (line 24, column 3).',
  },
};

/** Criterion 9, schema half: the failing field paths, from Zod. */
export const SchemaError: Story = {
  args: {
    text: sableJson.replace('"armorClass": 15', '"armorClass": -2'),
    onCommit: () => 'armorClass: expected a non-negative integer; hitPoints.total: required.',
  },
};

/**
 * Criterion 15: a document that would not load at all, seeded with its raw stored text rather
 * than a parsed document — which is the only reason this screen can repair it.
 */
export const DamagedDocument: Story = {
  args: {
    text: '{\n  "schemaVersion": 3,\n  "id": "6d0b0f7e-3c41-4a2a-9f6f-2a1f0c9d8e77",\n  "name": "Sable Nightwind"\n}\n',
    onCommit: () =>
      'Written by a newer version of this app (schema version 3); this build understands 1.',
  },
};
