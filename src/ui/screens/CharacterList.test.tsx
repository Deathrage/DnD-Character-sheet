// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { stubDialogElement } from '../../test/stubDialog.js';
import type { InstallView } from '../types.js';
import { CharacterList } from './CharacterList.js';

beforeAll(stubDialogElement);

function list(install: InstallView) {
  const onInstall = vi.fn();
  render(
    <CharacterList
      rows={[]}
      install={install}
      onInstall={onInstall}
      onOpen={() => {}}
      onOpenRawJson={() => {}}
      onCreate={() => {}}
      onImport={() => {}}
      onClone={() => {}}
      onDelete={() => {}}
    />,
  );
  return onInstall;
}

describe('CharacterList install button', () => {
  it("starts the browser's own prompt where there is one", () => {
    const onInstall = list({ kind: 'prompt' });
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(onInstall).toHaveBeenCalledOnce();
  });

  it('shows the steps where the browser installs but a page cannot start it', () => {
    const onInstall = list({ kind: 'steps', steps: 'Choose File → Add to Dock.' });
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    expect(screen.getByText('Choose File → Add to Dock.')).toBeTruthy();
    expect(onInstall).not.toHaveBeenCalled();
  });

  it.each([{ kind: 'installed' }, { kind: 'unavailable' }] as const)(
    'is absent when $kind',
    (install) => {
      list(install);
      expect(screen.queryByRole('button', { name: 'Install' })).toBeNull();
    },
  );
});
