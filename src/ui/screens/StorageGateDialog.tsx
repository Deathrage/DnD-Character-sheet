import { ResponsiveDialog } from '../components/ResponsiveDialog.js';

interface Props {
  /**
   * `'ask'` until `persist()` has been called; `'refused'` once it has been called and returned
   * false. There is no third state: a grant unmounts the gate for good (criterion 13).
   */
  phase: 'ask' | 'refused';
  /** `navigator.storage.estimate()`, which the spec pads — so it is presented as approximate. */
  estimate?: { usage: number; quota: number };
  onRequestPersist(): void;
  onContinueSession(): void;
}

/**
 * The persistence gate (spec §5). Blocking: no close button, no scrim dismissal, no Escape.
 * Running on evictable storage is not a thing to mention in small text and hope is read.
 *
 * It must not become a trap, though, because first-run denial is the likely outcome in Chrome —
 * so once a request has actually been made, a session-only escape appears. It is session-only:
 * the gate returns on the next launch while storage is still best-effort (criterion 14).
 */
export function StorageGateDialog({ phase, estimate, onRequestPersist, onContinueSession }: Props) {
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
              Continue for this session
            </button>
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
            The browser turned the request down. It decides from how much you have used the app, so
            two things actually move it:
          </p>
          <ul className="hint">
            <li>
              <b>Install the app</b> to your Home Screen or desktop. That is one of the signals the
              browser weighs, and you can ask again afterwards.
            </li>
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
