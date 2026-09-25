// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { HubGrid } from './HubGrid.js';

const HINT = 'Sign in with your Google account from the Characters menu to upload.';

function grid(props: Partial<Parameters<typeof HubGrid>[0]> = {}) {
  const onUpload = vi.fn();
  render(
    <HubGrid
      onOpen={() => {}}
      onExport={() => {}}
      onOpenRawJson={() => {}}
      onUpload={onUpload}
      {...props}
    />,
  );
  return { onUpload, button: screen.getByRole('button', { name: 'Upload to cloud' }) };
}

describe('HubGrid upload button', () => {
  it('uploads when enabled', () => {
    const { onUpload, button } = grid();
    fireEvent.click(button);
    expect(onUpload).toHaveBeenCalledOnce();
  });

  it('is disabled while signed out, and says why both on hover and on screen', () => {
    const { onUpload, button } = grid({ uploadDisabled: true, uploadHint: HINT });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    // The tooltip for a mouse, the line for a phone, which has no hover.
    expect(button.getAttribute('title')).toBe(HINT);
    expect(screen.getByText(HINT)).toBeTruthy();
    fireEvent.click(button);
    expect(onUpload).not.toHaveBeenCalled();
  });

  it('is disabled without a hint while the sign-in check is still running', () => {
    const { button } = grid({ uploadDisabled: true, uploadHint: null });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByText(HINT)).toBeNull();
  });
});
