import { formatWhen } from '../format.js';
import type { DiagnosticsView } from '../types.js';
import { CheckRow } from './CheckRow.js';
import { ConfirmDelete } from './ConfirmDelete.js';
import { ResponsiveDialog } from './ResponsiveDialog.js';

interface Props {
  view: DiagnosticsView;
  onSetOn(on: boolean): void;
  onDownload(): void;
  onClear(): void;
  onClose(): void;
}

/** "1 entry", "134 entries": shared with the menu row's line. */
export function countEntries(count: number): string {
  return count === 1 ? '1 entry' : `${count} entries`;
}

/**
 * The diagnostics log's switch and its two actions (spec 2026-11-22 §5). Presentational: the
 * log itself is `src/ui/diagnostics/`, wired by `App`.
 */
export function DiagnosticsDialog({ view, onSetOn, onDownload, onClear, onClose }: Props) {
  return (
    <ResponsiveDialog
      title="Diagnostics"
      open
      onClose={onClose}
      footer={
        <>
          <ConfirmDelete what="The diagnostics log" onConfirm={onClear}>
            Clear log
          </ConfirmDelete>
          <button
            type="button"
            className="primary"
            disabled={view.count === 0}
            onClick={onDownload}
          >
            Download log
          </button>
        </>
      }
    >
      <CheckRow label="Record slow moments" checked={view.on} onChange={onSetOn} />
      <p className="hint">
        Records how long screens and taps take, and which part of the app was busy. Nothing you type
        into a sheet is recorded. The log stays on this device until you download it.
      </p>
      <p className="hint">
        {view.count === 0
          ? 'Nothing recorded yet.'
          : view.since === null
            ? countEntries(view.count)
            : `${countEntries(view.count)} since ${formatWhen(view.since)}`}
      </p>
    </ResponsiveDialog>
  );
}
