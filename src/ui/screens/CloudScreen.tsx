import { ConfirmDelete } from '../components/ConfirmDelete.js';
import { ConflictDialog } from '../components/ConflictDialog.js';
import { formatWhen } from '../format.js';
import type { CloudView, ConflictView } from '../types.js';

interface Props {
  view: CloudView;
  /** The last action's sentence, or null. */
  message: string | null;
  conflict: ConflictView | null;
  onBack(): void;
  onSignIn(): void;
  onSignOut(): void;
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

export function CloudScreen({
  view,
  message,
  conflict,
  onBack,
  onSignIn,
  onSignOut,
  onRestore,
  onDeleteVersion,
  onDeleteCharacter,
  onResolveConflict,
}: Props) {
  const signedIn = view.status === 'signedIn';

  return (
    <div className="app cloud">
      <div className="lhead">
        <div className="vtop">
          <button type="button" className="txtbtn" onClick={onBack}>
            {'‹'} Characters
          </button>
          <h1>Cloud</h1>
          {signedIn && (
            <button
              type="button"
              className="txtbtn"
              style={{ marginLeft: 'auto' }}
              onClick={onSignOut}
            >
              Sign out
            </button>
          )}
        </div>
        {signedIn && view.user !== null && (
          <div className="sub">
            Signed in as {view.user.email ?? view.user.name} {'·'} Using{' '}
            {formatBytes(view.totalBytes)}
          </div>
        )}
      </div>

      {message !== null && (
        <div className="fieldError" role="alert">
          {message}
        </div>
      )}

      {!signedIn ? (
        // `.sv`, the sheet's own button pad — not `.empty`, whose placeholder opacity would grey
        // out the button inside it and whose 2px inset put it at the screen edge.
        <div className="sv">
          <p className="hint">
            Back up characters to your Google account, and restore them on any device.
          </p>
          <button
            type="button"
            className="newcat"
            disabled={view.status === 'signingIn'}
            onClick={onSignIn}
          >
            Sign in with Google
          </button>
        </div>
      ) : (
        <ul className="llist">
          {view.characters.length === 0 && (
            <li className="empty">
              Nothing uploaded yet. Open a character and tap Upload to cloud.
            </li>
          )}
          {view.characters.map((character) => (
            <li key={character.characterId}>
              <div className="ccard">
                <span className="cn">{character.name}</span>
                <span className="cc">
                  Level {character.level} {'·'} {character.versions.length}{' '}
                  {character.versions.length === 1 ? 'version' : 'versions'}
                </span>
              </div>
              <ul>
                {character.versions.map((version) => (
                  <li key={version.uploadedAt} className="cver">
                    <span>
                      Uploaded {formatWhen(version.uploadedAt)} {'·'} edited{' '}
                      {formatWhen(version.sheetUpdatedAt)} {'·'} {formatBytes(version.bytes)}
                      {version.fromNewerApp && ' · made by a newer version of the app'}
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
                    >
                      Delete
                    </ConfirmDelete>
                  </li>
                ))}
              </ul>
              <ConfirmDelete
                what={`Every cloud version of ${character.name}`}
                onConfirm={() => onDeleteCharacter(character.characterId)}
                className="txtbtn"
              >
                Delete all versions
              </ConfirmDelete>
            </li>
          ))}
        </ul>
      )}

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
