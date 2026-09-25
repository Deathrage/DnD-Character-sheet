import { ConfirmDelete } from '../components/ConfirmDelete.js';
import { ConflictDialog } from '../components/ConflictDialog.js';
import { formatWhen, initialOf } from '../format.js';
import type { CloudView, ConflictView } from '../types.js';
import { CloudTerms } from './Legal.js';

interface Props {
  view: CloudView;
  /** The last action's sentence, or null. */
  message: string | null;
  conflict: ConflictView | null;
  onBack(): void;
  onSignIn(): void;
  onRestore(characterId: string, uploadedAt: string): void;
  onDeleteVersion(characterId: string, uploadedAt: string): void;
  onDeleteCharacter(characterId: string): void;
  /** `null` is Cancel. */
  onResolveConflict(choice: 'replace' | 'keepBoth' | null): void;
}

export function formatBytes(bytes: number): string {
  return bytes < 1_000_000
    ? `${(bytes / 1000).toFixed(1)} KB`
    : `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * Sign-out is not here: it lives in the list menu's account panel, beside sign-in. This screen
 * is only reached signed in, and leaving it by signing out would strand the player on a page
 * whose whole content just disappeared.
 */
export function CloudScreen({
  view,
  message,
  conflict,
  onBack,
  onSignIn,
  onRestore,
  onDeleteVersion,
  onDeleteCharacter,
  onResolveConflict,
}: Props) {
  const signedIn = view.status === 'signedIn';
  const who = view.user?.name ?? view.user?.email;

  return (
    <div className="app cloud">
      <div className="lhead">
        <div className="vtop">
          <button type="button" className="back" onClick={onBack} aria-label="Back to characters">
            {'‹'}
          </button>
          <h1>Cloud</h1>
        </div>
      </div>

      <div className="cbody">
        {message !== null && (
          <div className="fieldError cmsg" role="alert">
            {message}
          </div>
        )}

        {!signedIn ? (
          <div className="chero">
            <span className="cheroico" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M7 19a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 10a4.5 4.5 0 0 1-.5 9z" />
                <path d="M12 16v-5M9.5 13.5 12 11l2.5 2.5" />
              </svg>
            </span>
            <h2>Back up to your Google account</h2>
            <p className="hint">
              Keep dated copies of your characters, and restore them on any device.
            </p>
            <button
              type="button"
              className="primary"
              disabled={view.status === 'signingIn'}
              onClick={onSignIn}
            >
              Sign in with Google
            </button>
            {view.status === 'signingIn' && <p className="hint">Waiting for Google{'…'}</p>}
            <CloudTerms />
          </div>
        ) : (
          <>
            {/* The list menu's account panel, so the account looks the same wherever it shows. */}
            <div className="mgroup">
              <div className="macct">
                <span className="mavatar" aria-hidden="true">
                  {initialOf(who)}
                </span>
                <span className="mtext">
                  <span className="mlabel">{who}</span>
                  {view.user?.name != null && view.user.email !== null && (
                    <span className="mdesc">{view.user.email}</span>
                  )}
                </span>
                <span className="cusage">
                  <span className="cusagev">{formatBytes(view.totalBytes)}</span>
                  <span className="mdesc">in the cloud</span>
                </span>
              </div>
            </div>

            {view.characters.length === 0 && (
              <p className="cempty">
                Nothing uploaded yet. Open a character and tap Upload to cloud.
              </p>
            )}

            {view.characters.map((character) => (
              <section key={character.characterId} className="cchar">
                <div className="cchead">
                  <div className="cctitle">
                    <h2 className="cn">{character.name}</h2>
                    <span className="cid">ID: {character.characterId}</span>
                  </div>
                  <span className="cc">
                    {character.versions.length}{' '}
                    {character.versions.length === 1 ? 'version' : 'versions'}
                  </span>
                </div>
                {/* Newest first, always: the repository sorts, and an upload is prepended. */}
                <ol className="ctl">
                  {character.versions.map((version, index) => (
                    <li key={version.uploadedAt} className="cver">
                      <span className="cvmain">
                        <span className="cvwhen">
                          {formatWhen(version.uploadedAt)}
                          {index === 0 && <span className="cvlatest">Latest</span>}
                        </span>
                        {/* Each part kept whole, so a wrap falls between them, never inside one. */}
                        <span className="cvmeta">
                          <span>Level {version.level}</span> {'·'}{' '}
                          <span>edited {formatWhen(version.sheetUpdatedAt)}</span> {'·'}{' '}
                          <span>{formatBytes(version.bytes)}</span>
                        </span>
                        {version.fromNewerApp && (
                          <span className="cvwarn">Made by a newer version of the app</span>
                        )}
                      </span>
                      <button
                        type="button"
                        className="txtbtn"
                        disabled={view.busy}
                        onClick={() => onRestore(character.characterId, version.uploadedAt)}
                      >
                        Restore
                      </button>
                      <ConfirmDelete
                        what={`The version uploaded ${formatWhen(version.uploadedAt)}`}
                        onConfirm={() => onDeleteVersion(character.characterId, version.uploadedAt)}
                        className="cicon cdel"
                        aria-label={`Delete version uploaded ${formatWhen(version.uploadedAt)}`}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
                        </svg>
                      </ConfirmDelete>
                    </li>
                  ))}
                </ol>
                <ConfirmDelete
                  what={`Every cloud version of ${character.name}`}
                  onConfirm={() => onDeleteCharacter(character.characterId)}
                  className="cdelall"
                >
                  Delete all versions
                </ConfirmDelete>
              </section>
            ))}
          </>
        )}
      </div>

      {conflict !== null && (
        <ConflictDialog
          conflict={conflict}
          incoming="The cloud version"
          onResolve={onResolveConflict}
        />
      )}
    </div>
  );
}
