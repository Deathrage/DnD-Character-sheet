import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CharacterFile,
  describeStorageFailure,
  type CharacterEntryBO,
  type CharacterLibraryBO,
  type CharacterSheetBO,
} from '../business/index.js';
import { useCharacterRows, useSheet, useStorageFailure, useStorageGate } from './bind.js';
import { navigate, useRoute } from './route.js';
import { CharacterHub } from './screens/CharacterHub.js';
import { CharacterList } from './screens/CharacterList.js';
import { RawJsonEditor } from './screens/RawJsonEditor.js';
import { StorageGateDialog } from './screens/StorageGateDialog.js';
import type { SectionKey } from './types.js';

/**
 * The app shell: the one place that owns a `CharacterLibraryBO`, turns the route into a screen,
 * and does the three things no business object can, because they are browser affordances rather
 * than rules — downloading a file, reading a picked one, and owning the open sheet's lifetime.
 *
 * The library is a prop, not a module singleton, so a test builds its own and nothing leaks
 * between them.
 */
export function App({ library }: { library: CharacterLibraryBO }) {
  const route = useRoute();
  const rows = useCharacterRows(library);
  const gate = useStorageGate(library.storageGate);
  const failure = useStorageFailure(library.storageGate);

  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const filePicker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([library.load(), library.storageGate.load()]).then(() => {
      if (!cancelled) setReady(true);
    });
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

      {route.name === 'raw' ? (
        <RawJson library={library} id={route.id} />
      ) : route.name === 'character' ? (
        /*
         * Keyed by id so React unmounts and remounts on a change of character. That is what makes
         * the open sheet's lifetime a component's: it is opened on mount and disposed on unmount,
         * with no effect anywhere having to notice that the route moved and clear it.
         */
        <Character key={route.id} library={library} id={route.id} section={route.section} />
      ) : (
        <>
          <CharacterList
            rows={rows}
            onOpen={(id) => navigate({ name: 'character', id, section: null })}
            onOpenRawJson={(id) => navigate({ name: 'raw', id })}
            onCreate={createCharacter}
            onImport={() => filePicker.current?.click()}
          />
          {problem !== null && (
            <div className="fieldError" role="alert">
              {problem}
            </div>
          )}
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
        />
      )}
    </>
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
  id,
  section,
}: {
  library: CharacterLibraryBO;
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
  return <Sheet sheet={state.sheet} section={section} />;
}

/**
 * Split out because `useSheet` is a hook and therefore cannot be called only once a sheet happens
 * to have finished opening.
 */
function Sheet({ sheet, section }: { sheet: CharacterSheetBO; section: SectionKey | null }) {
  const { data, actions } = useSheet(sheet);
  const id = data.character.id;

  return (
    <CharacterHub
      data={data}
      actions={actions}
      section={section}
      onSectionChange={(next) => navigate({ name: 'character', id, section: next })}
      onBack={() => navigate({ name: 'list' })}
      onExport={() => download(CharacterFile.of(sheet, new Date()))}
      onOpenRawJson={() => navigate({ name: 'raw', id })}
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
