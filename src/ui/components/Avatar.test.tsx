// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { Avatar } from './Avatar.js';

const PHOTO = 'https://lh3.googleusercontent.com/a/ja';

describe('Avatar', () => {
  it("shows the account's picture, sent without a referrer", () => {
    const { container } = render(<Avatar name="Ja" photoUrl={PHOTO} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe(PHOTO);
    expect(img?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(container.textContent).toBe('');
  });

  it('shows the initial when there is no picture', () => {
    const { container } = render(<Avatar name="ja" photoUrl={null} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('J');
  });

  it('falls back to the initial when the picture fails to load', () => {
    const { container } = render(<Avatar name="Ja" photoUrl={PHOTO} />);
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('J');
  });

  it("gives a different account's picture a fresh chance", () => {
    const { container, rerender } = render(<Avatar name="Ja" photoUrl={PHOTO} />);
    fireEvent.error(container.querySelector('img')!);
    rerender(<Avatar name="Other" photoUrl="https://lh3.googleusercontent.com/a/other" />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(
      'https://lh3.googleusercontent.com/a/other',
    );
  });
});
