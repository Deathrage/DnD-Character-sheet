// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { UpdatePrompt } from './UpdatePrompt.js';

const sw = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(async () => {}),
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [sw.needRefresh, sw.setNeedRefresh],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: sw.updateServiceWorker,
  }),
}));

beforeEach(() => {
  sw.needRefresh = false;
  sw.setNeedRefresh.mockClear();
  sw.updateServiceWorker.mockClear();
});

describe('UpdatePrompt', () => {
  it('shows nothing while no new version is waiting', () => {
    const { container } = render(<UpdatePrompt beforeReload={async () => {}} />);
    expect(container.innerHTML).toBe('');
  });

  it('saves pending edits before the new version reloads the page', async () => {
    sw.needRefresh = true;
    const order: string[] = [];
    let finishSave!: () => void;
    const beforeReload = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          order.push('save started');
          finishSave = () => {
            order.push('save finished');
            resolve();
          };
        }),
    );
    sw.updateServiceWorker.mockImplementation(async () => {
      order.push('reload');
    });

    render(<UpdatePrompt beforeReload={beforeReload} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    await Promise.resolve();
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();

    finishSave();
    await vi.waitFor(() => expect(sw.updateServiceWorker).toHaveBeenCalledWith(true));
    expect(order).toEqual(['save started', 'save finished', 'reload']);
  });

  it('can be put off until the next launch', () => {
    sw.needRefresh = true;
    render(<UpdatePrompt beforeReload={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(sw.setNeedRefresh).toHaveBeenCalledWith(false);
    expect(sw.updateServiceWorker).not.toHaveBeenCalled();
  });
});
