// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { LegalScreen } from './Legal.js';

describe('LegalScreen', () => {
  it.each([
    ['privacy', 'Privacy Policy'],
    ['terms', 'Terms of Use'],
  ] as const)('shows the %s page with a way to reach the controller', (page, title) => {
    const onBack = vi.fn();
    render(<LegalScreen page={page} onBack={onBack} />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeTruthy();
    // GDPR Art. 13(1)(a): the controller's identity and contact details, on every page that
    // promises the player anything.
    expect(
      screen.getAllByRole('link', { name: 'hi@lukasprochazka.net' })[0]?.getAttribute('href'),
    ).toBe('mailto:hi@lukasprochazka.net');
    fireEvent.click(screen.getByRole('button', { name: 'Back to characters' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
