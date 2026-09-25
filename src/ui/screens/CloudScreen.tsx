import { ConfirmDelete } from '../components/ConfirmDelete.js';
import { ConflictDialog } from '../components/ConflictDialog.js';
import { formatWhen, initialOf } from '../format.js';
import { formatBytes } from '../../shared/formatBytes.js';
import type { CloudView, ConflictView } from '../types.js';

interface Props {
  view: CloudView;
  /** The last action's sentence, or null. */
  message: string | null;
  conflict: ConflictView | null;
  onBack(): void;
  onRestore(characterId: string, uploadedAt: string): void;
  onDeleteVersion(characterId: string, uploadedAt: string): void;
  onDeleteCharacter(characterId: string): void;
  /** `null` is Cancel. */
  onResolveConflict(choice: 'replace' | 'keepBoth' | null): void;
}

/**
 * Only for a signed-in player: sign-in and sign-out both live in the list menu's account panel,
 * and the shell sends a signed-out player back to the characters. Until the sign-in check settles,
 * or when the cloud cannot be reached, only the message shows.
 */
export function CloudScreen({
  view,
  message,
  conflict,
  onBack,
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

        {signedIn && (
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
                  <span className="cusagev">{formatBytes(view.usedBytes)}</span>
                  <span className="mdesc">of {formatBytes(view.limitBytes)}</span>
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
                    <h2 className="cn">{character.name ?? 'Unreadable character'}</h2>
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
                          {version.sheetUpdatedAt !== null && (
                            <>
                              <span>Level {version.level}</span> {'·'}{' '}
                              <span>edited {formatWhen(version.sheetUpdatedAt)}</span> {'·'}{' '}
                            </>
                          )}
                          <span>{formatBytes(version.bytes)}</span>
                        </span>
                        {version.fromNewerApp ? (
                          <span className="cvwarn">Made by a newer version of the app</span>
                        ) : (
                          version.problem !== null && (
                            <span className="cvwarn">{version.problem}</span>
                          )
                        )}
                      </span>
                      <button
                        type="button"
                        className="txtbtn"
                        disabled={view.busy || version.sheetUpdatedAt === null}
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
                  what={`Every cloud version of ${character.name ?? 'Unreadable character'}`}
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
