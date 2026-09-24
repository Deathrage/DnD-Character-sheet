// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { stubDialogElement } from '../../test/stubDialog.js';
import type { InstallView } from '../types.js';
import { StorageGateDialog } from './StorageGateDialog.js';

beforeAll(stubDialogElement);

/** The refused phase is where the gate turns on the browser: install, or reset a blocked prompt. */
function refused(install: InstallView, asksPermission = false) {
  const handlers = { onRequestPersist: vi.fn(), onContinueSession: vi.fn(), onInstall: vi.fn() };
  render(
    <StorageGateDialog
      phase="refused"
      install={install}
      asksPermission={asksPermission}
      {...handlers}
    />,
  );
  return handlers;
}

describe('StorageGateDialog, refused', () => {
  it("offers the browser's own install prompt where there is one", () => {
    const { onInstall } = refused({ kind: 'prompt' });
    fireEvent.click(screen.getByRole('button', { name: 'Install app', hidden: true }));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it('names the steps where the browser installs but a page cannot start it', () => {
    refused({ kind: 'steps', steps: 'Tap Share, then Add to Home Screen.' });
    expect(screen.getByText('Tap Share, then Add to Home Screen.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Install app', hidden: true })).toBeNull();
  });

  it('tells a Firefox player to reset the blocked permission rather than install', () => {
    refused({ kind: 'steps', steps: 'Add to Home screen.' }, true);
    expect(screen.getByText(/padlock/)).toBeTruthy();
    expect(screen.queryByText('Add to Home screen.')).toBeNull();
  });

  it('still lets the player continue, having been told the data may be lost', () => {
    const { onContinueSession } = refused({ kind: 'unavailable' });
    fireEvent.click(screen.getByRole('button', { name: /may be lost/, hidden: true }));
    expect(onContinueSession).toHaveBeenCalledOnce();
  });
});
