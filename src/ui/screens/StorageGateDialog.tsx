import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import type { InstallView } from '../types.js';

interface Props {
  /**
   * `'ask'` until `persist()` has been called; `'refused'` once it has been called and returned
   * false. There is no third state: a grant unmounts the gate for good (criterion 13).
   */
  phase: 'ask' | 'refused';
  /** `navigator.storage.estimate()`, which the spec pads — so it is presented as approximate. */
  estimate?: { usage: number; quota: number };
  /** What the refused phase can offer toward installing, the lever silent browsers weigh. */
  install: InstallView;
  /**
   * The browser asked the player itself (Firefox), so a refusal is a permission the player
   * blocked — which it remembers — and installing is not the fix.
   */
  asksPermission: boolean;
  onRequestPersist(): void;
  onContinueSession(): void;
  onInstall(): void;
}

/**
 * The persistence gate (spec §5). Blocking: no close button, no scrim dismissal, no Escape.
 * Running on evictable storage is not a thing to mention in small text and hope is read.
 *
 * It must not become a trap, though, because first-run denial is the likely outcome in Chrome —
 * so once a request has actually been made, a session-only escape appears. It is session-only:
 * the gate returns on the next launch while storage is still best-effort (criterion 14).
 */
export function StorageGateDialog({
  phase,
  estimate,
  install,
  asksPermission,
  onRequestPersist,
  onContinueSession,
  onInstall,
}: Props) {
  return (
    <ResponsiveDialog
      title="Your characters are not safe here yet"
      open
      blocking
      // Never reached while `blocking`; ResponsiveDialog requires the prop, and a no-op is
      // more honest than pretending there is somewhere to close to.
      onClose={() => {}}
      footer={
        phase === 'ask' ? (
          <button type="button" className="primary" onClick={onRequestPersist}>
            Make storage permanent
          </button>
        ) : (
          <>
            <button type="button" className="secondary" onClick={onContinueSession}>
              Continue anyway, my data may be lost
            </button>
            {!asksPermission && install.kind === 'prompt' && (
              <button type="button" className="primary" onClick={onInstall}>
                Install app
              </button>
            )}
            <button type="button" className="primary" onClick={onRequestPersist}>
              Ask again
            </button>
          </>
        )
      }
    >
      {phase === 'ask' ? (
        <p className="hint" style={{ marginTop: 0 }}>
          This browser may delete everything this app has stored — all characters at once — if the
          device runs low on space, or if you do not open the app for a while. Making storage
          permanent means only you can clear it.
        </p>
      ) : (
        <>
          <p className="hint" style={{ marginTop: 0 }}>
            {asksPermission
              ? 'Permanent storage was declined or is blocked, and the browser remembers that choice.'
              : 'The browser turned the request down. It decides on its own, and what it trusts is an installed app.'}
          </p>
          <ul className="hint">
            {asksPermission ? (
              <li>
                <b>Reset the permission</b>: click the padlock next to the address, clear the
                blocked <i>persistent storage</i> permission, then choose Ask again.
              </li>
            ) : (
              <InstallAdvice install={install} />
            )}
            <li>
              <b>Export your characters</b> now. An exported <code>.json</code> outlives the browser
              profile entirely — it is the only copy that survives storage being cleared.
            </li>
          </ul>
        </>
      )}
      {estimate && (
        <p className="hint">
          Using about {formatBytes(estimate.usage)} of {formatBytes(estimate.quota)} available.
        </p>
      )}
    </ResponsiveDialog>
  );
}

function InstallAdvice({ install }: { install: InstallView }) {
  switch (install.kind) {
    case 'prompt':
      return (
        <li>
          <b>Install the app</b> with the button below, then choose Ask again if this is still up.
        </li>
      );
    case 'steps':
      return (
        <li>
          <b>Install the app</b>: <span>{install.steps}</span> Choose Ask again once it opens.
        </li>
      );
    case 'installed':
      return (
        <li>
          <b>The app is installed.</b> Open it from its icon and choose Ask again there.
        </li>
      );
    case 'unavailable':
      return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
