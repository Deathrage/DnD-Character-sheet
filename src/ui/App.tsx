import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CharacterFile,
  describeStorageFailure,
  type CharacterEntryBO,
  type CharacterLibraryBO,
  type CharacterSheetBO,
  type CloudBackup,
  type RestoreChoice,
} from '../business/index.js';
import {
  useCharacterRows,
  useCloud,
  useSheet,
  useStorageFailure,
  useStorageGate,
  useUploadNotice,
} from './bind.js';
import { useInstall } from './install.js';
import { navigate, useRoute } from './route.js';
import { CharacterHub } from './screens/CharacterHub.js';
import { CharacterList } from './screens/CharacterList.js';
import { CloudScreen, formatWhen } from './screens/CloudScreen.js';
import { RawJsonEditor } from './screens/RawJsonEditor.js';
import { StorageGateDialog } from './screens/StorageGateDialog.js';
import type { ConflictView, SectionKey } from './types.js';

/**
 * The app shell: the one place that owns a `CharacterLibraryBO`, turns the route into a screen,
 * and does the three things no business object can, because they are browser affordances rather
 * than rules — downloading a file, reading a picked one, and owning the open sheet's lifetime.
 *
 * The library is a prop, not a module singleton, so a test builds its own and nothing leaks
 * between them.
 */
export function App({ library, cloud }: { library: CharacterLibraryBO; cloud: CloudBackup }) {
  const route = useRoute();
  const rows = useCharacterRows(library);
  const gate = useStorageGate(library.storageGate);
  const failure = useStorageFailure(library.storageGate);
  // Installing is what moves `persist()` in Chromium and Safari, so it is asked again straight away.
  const install = useInstall(
    useCallback(() => void library.storageGate.requestPersist(), [library]),
  );

  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await Promise.all([library.load(), library.storageGate.load()]);
      } catch {
        // Both of those report their own failures through the storage gate, so there is nothing
        // to show from here. What matters is that `setReady` still runs: a rejection that got
        // this far used to leave the screen on "Loading…" permanently, with no message — the
        // worst way to fail, and reachable for real in a browser that blocks IndexedDB.
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [library]);

  const createCharacter = useCallback(() => {
    void library.create('Unnamed character').then((sheet) => {
      navigate({ name: 'character', id: sheet.id, section: null });
    });
  }, [library]);

  const importPicked = useCallback(
    async (input: HTMLInputElement) => {
      const picked = input.files?.[0];
      // Cleared before anything can fail, so picking the same file twice still fires `change`.
      input.value = '';
      if (picked === undefined) return;
      const read = CharacterFile.read(await picked.text());
      if (!read.ok) {
        setProblem(read.message);
        return;
      }
      const sheet = await library.add(read.file);
      navigate({ name: 'character', id: sheet.id, section: null });
    },
    [library],
  );

  // Both the list and the gate are meaningless until `load()` has answered: the list would flash
  // empty, and the gate would flash open over it because `persistence` is still `unknown`.
  if (!ready) return <Notice>Loading{'…'}</Notice>;

  return (
    <>
      {failure !== null && (
        <div className="fieldError" role="alert">
          {describeStorageFailure(failure)}{' '}
          <button
            type="button"
            className="txtbtn"
            onClick={() => library.storageGate.clearFailure()}
          >
            Dismiss
          </button>
        </div>
      )}

      {route.name === 'cloud' ? (
        <Cloud cloud={cloud} />
      ) : route.name === 'raw' ? (
        <RawJson library={library} id={route.id} />
      ) : route.name === 'character' ? (
        /*
         * Keyed by id so React unmounts and remounts on a change of character. That is what makes
         * the open sheet's lifetime a component's: it is opened on mount and disposed on unmount,
         * with no effect anywhere having to notice that the route moved and clear it.
         */
        <Character
          key={route.id}
          library={library}
          cloud={cloud}
          id={route.id}
          section={route.section}
        />
      ) : (
        <>
          <CharacterList
            rows={rows}
            install={install.view}
            onInstall={install.install}
            onOpen={(id) => navigate({ name: 'character', id, section: null })}
            onOpenRawJson={(id) => navigate({ name: 'raw', id })}
            onCreate={createCharacter}
            onImport={() => filePicker.current?.click()}
            onOpenCloud={() => navigate({ name: 'cloud' })}
            onClone={(id) => {
              const entry = library.entries.find((candidate) => candidate.id === id);
              void entry?.clone().then(setProblem);
            }}
            onDelete={(id) => {
              void library.entries.find((candidate) => candidate.id === id)?.remove();
            }}
          />
          {problem !== null && (
            <div className="fieldError" role="alert">
              {problem}
            </div>
          )}
          {/* Only on the list, and only in dev: reseeding deletes every character, which would
              pull the document out from under an open sheet. */}
          {import.meta.env.DEV && <DevReseed library={library} />}
        </>
      )}

      <input
        ref={filePicker}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(event) => void importPicked(event.currentTarget)}
      />

      {/* Blocking, and rendered over whatever screen is up: storage that can be evicted is not a
          thing to mention in small text on one screen and hope is read (criteria 13 and 14). */}
      {gate.open && (
        <StorageGateDialog
          phase={gate.phase}
          {...(gate.estimate === undefined ? {} : { estimate: gate.estimate })}
          onRequestPersist={() => void library.storageGate.requestPersist()}
          onContinueSession={() => library.storageGate.dismissForSession()}
          install={install.view}
          asksPermission={install.asksPermission}
          onInstall={install.install}
        />
      )}
    </>
  );
}

/**
 * Deletes every character and seeds again, for when you have poked the sample data into a state
 * you no longer want. The alternative is clearing the site's storage in devtools, which also
 * takes the persistence grant with it.
 *
 * The whole component sits behind `import.meta.env.DEV`, which Vite replaces with a literal
 * `false` in a production build — so this, and the `devSeed` module it reaches through a dynamic
 * import, are both dropped from the bundle. Styled inline rather than from `styles.css` for the
 * same reason: a dev-only rule in the shipped stylesheet would ship.
 *
 * It confirms first. One stray click would otherwise delete work that is not in the seed.
 */
function DevReseed({ library }: { library: CharacterLibraryBO }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      style={{
        position: 'fixed',
        left: 16,
        bottom: 16,
        padding: '8px 12px',
        border: '1px dashed currentColor',
        borderRadius: 8,
        background: 'transparent',
        color: 'var(--muted, #888)',
        font: 'inherit',
        fontSize: 12,
        cursor: busy ? 'progress' : 'pointer',
      }}
      onClick={() => {
        if (!globalThis.confirm('Delete every character and seed the samples again?')) return;
        setBusy(true);
        void (async () => {
          const { reseed } = await import('../devSeed.js');
          await reseed(library);
          setBusy(false);
        })();
      }}
    >
      {busy ? 'Reseeding…' : 'Reseed (dev)'}
    </button>
  );
}

type OpenState = { ok: true; sheet: CharacterSheetBO } | { ok: false; message: string } | null;

/**
 * One character, for as long as the route names it.
 *
 * Every `setState` here happens inside the `then`, never in the effect body — the effect's job is
 * to start an open and to guarantee the sheet is disposed, and both cancellation paths matter: a
 * result that arrives after unmount disposes the sheet it was handed rather than leaking an
 * autosave onto a character nobody is looking at.
 */
function Character({
  library,
  cloud,
  id,
  section,
}: {
  library: CharacterLibraryBO;
  cloud: CloudBackup;
  id: string;
  section: SectionKey | null;
}) {
  const [state, setState] = useState<OpenState>(null);

  useEffect(() => {
    const entry = library.entries.find((candidate) => candidate.id === id);
    if (entry === undefined) {
      navigate({ name: 'list' });
      return;
    }
    let cancelled = false;
    let opened: CharacterSheetBO | null = null;
    void entry.open().then((result) => {
      if (cancelled) {
        if (result.ok) result.sheet.dispose();
        return;
      }
      if (result.ok) opened = result.sheet;
      setState(result);
    });
    return () => {
      cancelled = true;
      // `dispose()` stops autosave, and `Autosave.stop()` writes whatever the debounce had not
      // reached — so navigating away never costs the last half second of typing.
      opened?.dispose();
    };
  }, [library, id]);

  if (state === null) return <Notice>Opening{'…'}</Notice>;
  if (!state.ok) {
    return (
      <Notice>
        {state.message}{' '}
        <button type="button" className="txtbtn" onClick={() => navigate({ name: 'list' })}>
          Back to characters
        </button>
      </Notice>
    );
  }
  return <Sheet sheet={state.sheet} cloud={cloud} section={section} />;
}

/**
 * Split out because `useSheet` is a hook and therefore cannot be called only once a sheet happens
 * to have finished opening.
 */
function Sheet({
  sheet,
  cloud,
  section,
}: {
  sheet: CharacterSheetBO;
  cloud: CloudBackup;
  section: SectionKey | null;
}) {
  const { data, actions } = useSheet(sheet);
  const id = data.character.id;
  const notice = useUploadNotice(cloud, id);

  return (
    <CharacterHub
      data={data}
      actions={actions}
      section={section}
      onSectionChange={(next) => navigate({ name: 'character', id, section: next })}
      onBack={() => navigate({ name: 'list' })}
      onExport={() => download(CharacterFile.of(sheet, new Date()))}
      onOpenRawJson={() => navigate({ name: 'raw', id })}
      onUpload={() => void cloud.upload(id)}
      uploadNotice={
        notice === null
          ? null
          : notice.ok
            ? `Uploaded ${formatWhen(notice.uploadedAt)}`
            : notice.message
      }
    />
  );
}

/**
 * The cloud screen's shell: it refreshes on arrival, and owns the two pieces of transient state
 * the business layer has no business holding — the last sentence, and the open Replace / Keep
 * both question with the version it is about.
 */
function Cloud({ cloud }: { cloud: CloudBackup }) {
  const view = useCloud(cloud);
  const [message, setMessage] = useState<string | null>(null);
  const [asking, setAsking] = useState<{
    characterId: string;
    uploadedAt: string;
    conflict: ConflictView;
  } | null>(null);

  useEffect(() => {
    void cloud.refresh().then(setMessage);
  }, [cloud]);

  const restore = async (characterId: string, uploadedAt: string, choice?: RestoreChoice) => {
    const result = await cloud.restore(characterId, uploadedAt, choice);
    if (result.ok) {
      navigate({ name: 'list' });
    } else if (result.kind === 'conflict') {
      setAsking({ characterId, uploadedAt, conflict: result });
    } else {
      setMessage(result.message);
    }
  };

  return (
    <CloudScreen
      view={view}
      message={message}
      conflict={asking?.conflict ?? null}
      onBack={() => navigate({ name: 'list' })}
      onSignIn={() => void cloud.signIn().then(setMessage)}
      onSignOut={() => void cloud.signOut().then(setMessage)}
      onRestore={(characterId, uploadedAt) => void restore(characterId, uploadedAt)}
      onDeleteVersion={(characterId, uploadedAt) =>
        void cloud.deleteVersion(characterId, uploadedAt).then(setMessage)
      }
      onDeleteCharacter={(characterId) => void cloud.deleteCharacter(characterId).then(setMessage)}
      onResolveConflict={(choice) => {
        const pending = asking;
        setAsking(null);
        if (choice !== null && pending !== null) {
          void restore(pending.characterId, pending.uploadedAt, choice);
        }
      }}
    />
  );
}

/**
 * The repair screen. It has its own route, which settles spec §10's open item about autosave while
 * the editor is up: leaving `#/c/:id` unmounts `Character` and disposes the sheet, so a half-typed
 * document cannot be autosaved behind the editor's back, and a committed repair is re-opened from
 * the list rather than merged into a sheet that is already gone (spec §9's "no `replaceDocument`").
 */
function RawJson({ library, id }: { library: CharacterLibraryBO; id: string }) {
  const entry: CharacterEntryBO | undefined = library.entries.find(
    (candidate) => candidate.id === id,
  );
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (entry === undefined) return;
    let cancelled = false;
    void entry.rawText().then((raw) => {
      if (!cancelled) setText(raw);
    });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  if (entry === undefined) return <Notice>This character is no longer in this browser.</Notice>;
  if (text === null) return <Notice>Loading{'…'}</Notice>;

  return (
    <RawJsonEditor
      text={text}
      onCommit={(edited) => entry.repair(edited)}
      onClose={() => navigate({ name: 'list' })}
    />
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="app">
      <div className="empty">{children}</div>
    </div>
  );
}

/**
 * Purely a browser affordance: `CharacterFile` knows the name and the text, and only the DOM can
 * put them in the player's downloads. The object URL is revoked immediately — `click()` has
 * already read it synchronously.
 */
function download(file: CharacterFile): void {
  const url = URL.createObjectURL(new Blob([file.text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = file.filename;
  link.click();
  URL.revokeObjectURL(url);
}
