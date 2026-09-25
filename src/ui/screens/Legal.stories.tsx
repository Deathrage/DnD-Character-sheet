import type { Meta, StoryObj } from '@storybook/react-vite';
import { LegalScreen } from './Legal.js';

const meta = {
  title: 'Screens/Legal',
  component: LegalScreen,
  args: { page: 'privacy', onBack: () => {} },
} satisfies Meta<typeof LegalScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const PrivacyPolicy: Story = {};
export const TermsOfUse: Story = { args: { page: 'terms' } };
