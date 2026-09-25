import { useState } from 'react';
import { formatWhen } from '../format.js';
import type { ConflictView } from '../types.js';
import { ResponsiveDialog } from './ResponsiveDialog.js';

interface Props {
  conflict: ConflictView;
  /** What is being brought in, as the start of a sentence: "The cloud version", "The file". */
  incoming: string;
  /** `null` is Cancel. */
  onResolve(choice: 'replace' | 'keepBoth' | null): void;
}

/**
 * The Replace / Keep both question, asked the same way by a cloud restore and a file import.
 * Replace asks again first, as a delete does: it overwrites this app's copy, and nothing has undo.
 * The second question takes over the same dialog rather than stacking a second one on top.
 */
export function ConflictDialog({ conflict, incoming, onResolve }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <ResponsiveDialog
        title="Replace?"
        open
        onClose={() => onResolve(null)}
        footer={
          <>
            <button type="button" className="secondary" onClick={() => setConfirming(false)}>
              Back
            </button>
            <button type="button" className="del" onClick={() => onResolve('replace')}>
              Replace
            </button>
          </>
        }
      >
        <p className="hint" style={{ marginTop: 0 }}>
          This app's copy of {conflict.name} will be overwritten. This cannot be undone.
        </p>
      </ResponsiveDialog>
    );
  }

  return (
    <ResponsiveDialog
      title="Already in this app"
      open
      onClose={() => onResolve(null)}
      footer={
        <>
          <button type="button" className="secondary" onClick={() => onResolve(null)}>
            Cancel
          </button>
          <button type="button" className="secondary" onClick={() => onResolve('keepBoth')}>
            Keep both
          </button>
          <button type="button" className="del" onClick={() => setConfirming(true)}>
            Replace
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        {conflict.name} is already in this app.
      </p>
      <p className="hint">
        This app's copy:{' '}
        {conflict.localUpdatedAt === null
          ? 'damaged'
          : `edited ${formatWhen(conflict.localUpdatedAt)}`}
        . {incoming}: edited {formatWhen(conflict.incomingUpdatedAt)}.
      </p>
      {conflict.localUpdatedAt !== null && conflict.incomingUpdatedAt < conflict.localUpdatedAt && (
        <p className="hint">{incoming} is older than this app's copy.</p>
      )}
    </ResponsiveDialog>
  );
}
