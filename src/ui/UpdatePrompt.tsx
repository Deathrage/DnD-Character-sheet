import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * Offers a new version of the app once its service worker has installed and is waiting.
 *
 * `registerType: 'prompt'` rather than `'autoUpdate'`: an automatic update reloads every open tab
 * on its own schedule, and the only thing between that reload and the last half second of typing
 * would be the `pagehide` flush, which is fire-and-forget. Here the reload waits for
 * `beforeReload` — the library's `flush()`, which resolves only once every pending autosave has
 * been written — so an update can never cost an edit.
 *
 * Rendered from `main.tsx`, beside `App` rather than inside it, so `App` and its tests never touch
 * the plugin's virtual module.
 *
 * ponytail: checks for a new version only when the app is launched or reloaded. Add
 * `registration.update()` on an interval if sessions ever run long enough to matter.
 */
export function UpdatePrompt({ beforeReload }: { beforeReload: () => Promise<void> }) {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const [saving, setSaving] = useState(false);

  if (!needRefresh) return null;

  const reload = async () => {
    setSaving(true);
    await beforeReload();
    await updateServiceWorker(true);
  };

  return (
    <div className="updatePrompt" role="status">
      A new version is ready.{' '}
      <button type="button" className="txtbtn" disabled={saving} onClick={() => void reload()}>
        Reload
      </button>{' '}
      <button
        type="button"
        className="txtbtn"
        disabled={saving}
        onClick={() => setNeedRefresh(false)}
      >
        Later
      </button>
    </div>
  );
}
