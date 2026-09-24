import { useState } from 'react';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import type { CharacterRow, ClassSummaryView, HitPointsView, InstallView } from '../types.js';

interface Props {
  rows: CharacterRow[];
  onOpen(id: string): void;
  /** A damaged document's only action (criterion 15): the raw JSON, for hand-repair. */
  onOpenRawJson(id: string): void;
  onCreate(): void;
  onImport(): void;
  /** Both are called only once the player has confirmed; a delete has no undo (spec §6). */
  onClone(id: string): void;
  onDelete(id: string): void;
  /** Absent, `installed` or `unavailable` hides the Install button. */
  install?: InstallView;
  /** Starts the browser's own prompt; only called when `install` is `prompt`. */
  onInstall?(): void;
}

export function CharacterList({
  rows,
  install,
  onInstall,
  onOpen,
  onOpenRawJson,
  onCreate,
  onImport,
  onClone,
  onDelete,
}: Props) {
  const [confirming, setConfirming] = useState<{
    action: 'clone' | 'delete';
    row: CharacterRow;
  } | null>(null);
  const [showingSteps, setShowingSteps] = useState(false);

  return (
    <div className="app">
      <div className="lhead">
        <div className="vtop">
          <h1>Characters</h1>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 12 }}>
            {(install?.kind === 'prompt' || install?.kind === 'steps') && (
              <button
                type="button"
                className="txtbtn"
                onClick={() => (install.kind === 'prompt' ? onInstall?.() : setShowingSteps(true))}
              >
                Install
              </button>
            )}
            <button type="button" className="txtbtn" onClick={onImport}>
              Import
            </button>
          </span>
        </div>
        <div className="sub">{rows.length === 1 ? '1 saved' : `${rows.length} saved`}</div>
      </div>

      <ul className="llist">
        {rows.length === 0 && <li className="empty">No characters yet. Tap + to make one.</li>}
        {rows.map((row) => (
          <li key={row.id}>
            {row.ok ? (
              <button type="button" className="ccard" onClick={() => onOpen(row.id)}>
                <span className="cn">{row.name}</span>
                <span className="cc">
                  {summariseClasses(row.classes)} {'·'} Level {row.level}
                </span>
                <span className="chp">{summariseHitPoints(row.hitPoints)}</span>
              </button>
            ) : (
              <button type="button" className="ccard damaged" onClick={() => onOpenRawJson(row.id)}>
                <span className="cn">Damaged character</span>
                <span className="cc">{row.message}</span>
                <span className="chp">Open raw JSON {'›'}</span>
              </button>
            )}
            {/* Siblings of the card, laid over its right edge: a button may not contain a button. */}
            <div className="cactions">
              {row.ok && (
                <button
                  type="button"
                  className="cicon"
                  aria-label={`Clone ${row.name}`}
                  title="Clone"
                  onClick={() => setConfirming({ action: 'clone', row })}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="8" y="8" width="12" height="12" rx="2" />
                    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                  </svg>
                </button>
              )}
              <button
                type="button"
                className="cicon cdel"
                aria-label={`Delete ${row.ok ? row.name : 'damaged character'}`}
                title="Delete"
                onClick={() => setConfirming({ action: 'delete', row })}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ul>

      <button type="button" className="fab" onClick={onCreate} aria-label="New character">
        +
      </button>

      {showingSteps && install?.kind === 'steps' && (
        <ResponsiveDialog
          title="Install the app"
          open
          onClose={() => setShowingSteps(false)}
          footer={
            <button type="button" className="primary" onClick={() => setShowingSteps(false)}>
              Done
            </button>
          }
        >
          <p className="hint" style={{ marginTop: 0 }}>
            {install.steps}
          </p>
          <p className="hint">
            An installed app starts offline and is the one this browser trusts to keep its storage.
          </p>
        </ResponsiveDialog>
      )}

      {confirming !== null && (
        <ConfirmDialog
          action={confirming.action}
          name={confirming.row.ok ? confirming.row.name : 'This damaged character'}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            if (confirming.action === 'clone') onClone(confirming.row.id);
            else onDelete(confirming.row.id);
            setConfirming(null);
          }}
        />
      )}
    </div>
  );
}

const CONFIRM = {
  clone: {
    title: 'Clone character',
    button: 'Clone',
    className: 'primary',
    body: (name: string) => `${name} will be copied into a new character named "${name} (copy)".`,
  },
  delete: {
    title: 'Delete character',
    button: 'Delete',
    className: 'del',
    body: (name: string) =>
      `${name} will be removed from this browser. This cannot be undone — export it first if you might want it back.`,
  },
} as const;

function ConfirmDialog({
  action,
  name,
  onCancel,
  onConfirm,
}: {
  action: keyof typeof CONFIRM;
  name: string;
  onCancel(): void;
  onConfirm(): void;
}) {
  const copy = CONFIRM[action];
  return (
    <ResponsiveDialog
      title={copy.title}
      open
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={copy.className} onClick={onConfirm}>
            {copy.button}
          </button>
        </>
      }
    >
      <p className="hint" style={{ marginTop: 0 }}>
        {copy.body(name)}
      </p>
    </ResponsiveDialog>
  );
}

export function summariseClasses(classes: ClassSummaryView[]): string {
  if (classes.length === 0) return 'No class';
  return classes.map((entry) => `${entry.name} ${entry.level}`).join(' / ');
}

export function summariseHitPoints({ current, total, temporary }: HitPointsView): string {
  const temp = temporary > 0 ? ` (+${temporary} temp)` : '';
  return `HP ${current} / ${total}${temp}`;
}
