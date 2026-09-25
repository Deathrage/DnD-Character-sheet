import { useId, useState, type ReactNode } from 'react';
import { Portrait } from '../components/Portrait.js';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import { formatWhen, initialOf } from '../format.js';
import type { CharacterRow, CloudView, InstallView } from '../types.js';

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
  /** Absent, `installed` or `unavailable` hides the menu's Install item. */
  install?: InstallView;
  /** Starts the browser's own prompt; only called when `install` is `prompt`. */
  onInstall?(): void;
  /** Absent hides the menu's account panel and Manage cloud — the stories, and any app without a cloud. */
  account?: Pick<CloudView, 'status' | 'user'>;
  /** The menu is opening: the moment to settle `account.status`, which is `unknown` until asked. */
  onOpenMenu?(): void;
  /** Both resolve to a sentence to show in the menu, or null. */
  onSignIn?(): Promise<string | null>;
  onSignOut?(): Promise<string | null>;
  onOpenCloud?(): void;
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
  account,
  onOpenMenu,
  onSignIn,
  onSignOut,
  onOpenCloud,
}: Props) {
  const [confirming, setConfirming] = useState<{
    action: 'clone' | 'delete';
    row: CharacterRow;
  } | null>(null);
  const [showingSteps, setShowingSteps] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMessage, setMenuMessage] = useState<string | null>(null);
  const signedIn = account?.status === 'signedIn';

  /** Every item but the account panel leaves the menu: what it opens replaces or covers it. */
  const fromMenu = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  return (
    <div className="app">
      <div className="lhead">
        <div className="vtop">
          <h1>Characters</h1>
          {/* The same quiet icon button as a card's clone and delete, not an outlined circle. */}
          <button
            type="button"
            className="cicon mbtn"
            aria-label="Menu"
            title="Menu"
            onClick={() => {
              setMenuMessage(null);
              setMenuOpen(true);
              onOpenMenu?.();
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
        <div className="sub">{rows.length === 1 ? '1 saved' : `${rows.length} saved`}</div>
      </div>

      <ul className="llist">
        {rows.length === 0 && <li className="empty">No characters yet. Tap + to make one.</li>}
        {rows.map((row) => (
          <li key={row.id}>
            {row.ok ? (
              <button type="button" className="ccard" onClick={() => onOpen(row.id)}>
                <Portrait src={row.portrait} name={row.name} />
                <span className="cn">{row.name}</span>
                <span className="cid">ID: {row.id}</span>
                <span className="cc">
                  Level {row.level} {'·'} Edited {formatWhen(row.updatedAt)}
                </span>
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

      {menuOpen && (
        <ResponsiveDialog title="Menu" open onClose={() => setMenuOpen(false)}>
          {/* Each group is one section; the groups' own edges are the separators. */}
          {account !== undefined && (
            <>
              <ul className="mgroup">
                {signedIn ? (
                  <li className="macct">
                    <span className="mavatar" aria-hidden="true">
                      {initialOf(account.user?.name ?? account.user?.email)}
                    </span>
                    <span className="mtext">
                      <span className="mlabel">{account.user?.name ?? account.user?.email}</span>
                      {account.user?.name != null && account.user.email !== null && (
                        <span className="mdesc">{account.user.email}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      className="txtbtn"
                      onClick={() => void onSignOut?.().then(setMenuMessage)}
                    >
                      Sign out
                    </button>
                  </li>
                ) : (
                  <MenuItem
                    icon={ICONS.account}
                    label="Sign in with Google"
                    description={
                      account.status === 'signingIn'
                        ? 'Waiting for Google…'
                        : 'Back up characters and restore them on any device.'
                    }
                    disabled={account.status === 'signingIn'}
                    onClick={() => void onSignIn?.().then(setMenuMessage)}
                  />
                )}
                <MenuItem
                  icon={ICONS.cloud}
                  label="Manage cloud"
                  description={
                    signedIn ? 'Restore or delete backed-up versions.' : 'Sign in first.'
                  }
                  disabled={!signedIn}
                  chevron
                  onClick={fromMenu(() => onOpenCloud?.())}
                />
              </ul>
              {menuMessage !== null && (
                <div className="fieldError mmsg" role="alert">
                  {menuMessage}
                </div>
              )}
            </>
          )}
          <ul className="mgroup">
            <MenuItem
              icon={ICONS.import}
              label="Import from .json"
              description="Add a character from an exported file."
              onClick={fromMenu(onImport)}
            />
          </ul>
          {(install?.kind === 'prompt' || install?.kind === 'steps') && (
            <ul className="mgroup">
              <MenuItem
                icon={ICONS.install}
                label="Install to phone"
                description="Starts offline, and keeps your characters safer."
                onClick={fromMenu(() =>
                  install.kind === 'prompt' ? onInstall?.() : setShowingSteps(true),
                )}
              />
            </ul>
          )}
        </ResponsiveDialog>
      )}

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

const ICONS = {
  account: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  cloud: (
    <svg viewBox="0 0 24 24">
      <path d="M7 19a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 10a4.5 4.5 0 0 1-.5 9z" />
    </svg>
  ),
  import: (
    <svg viewBox="0 0 24 24">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9 14l3 3 3-3" />
    </svg>
  ),
  install: (
    <svg viewBox="0 0 24 24">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M12 7v6M9.5 10.5 12 13l2.5-2.5M11 18h2" />
    </svg>
  ),
};

/**
 * One row of the list menu. Named by its label alone; the line under it is the description, so a
 * screen reader reads "Manage cloud, dimmed, Sign in first." rather than one run-on name.
 */
function MenuItem({
  icon,
  label,
  description,
  disabled = false,
  chevron = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  disabled?: boolean;
  chevron?: boolean;
  onClick(): void;
}) {
  const id = useId();
  return (
    <li>
      <button
        type="button"
        className="mitem"
        disabled={disabled}
        aria-labelledby={`${id}l`}
        aria-describedby={`${id}d`}
        onClick={onClick}
      >
        <span className="mico" aria-hidden="true">
          {icon}
        </span>
        <span className="mtext">
          <span className="mlabel" id={`${id}l`}>
            {label}
          </span>
          <span className="mdesc" id={`${id}d`}>
            {description}
          </span>
        </span>
        {chevron && (
          <span className="chev" aria-hidden="true">
            {'›'}
          </span>
        )}
      </button>
    </li>
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
      `${name} will be removed from this app. This cannot be undone — export it first if you might want it back.`,
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
