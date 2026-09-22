import { useState } from 'react';
import type { NameResult } from '../types.js';

interface Props {
  /**
   * The document as text. For a healthy character this is the pretty-printed document; for a
   * damaged one it is the raw stored text, exactly as it sits in IndexedDB (criterion 15).
   */
  text: string;
  /**
   * Parses and stores. Returns the message to show — a syntax error with its position, or the
   * failing field paths — or `null` once it is saved. The two failure classes read differently
   * because they are different problems, but the editor only has to print the sentence.
   */
  onCommit(text: string): NameResult | Promise<NameResult>;
  onClose(): void;
}

/**
 * The document as text, for hand-repair.
 *
 * It edits a draft string, never the observable document (spec §5): a half-typed document must
 * not reach autosave. A rejected commit keeps the text — that is the whole feature, since the
 * text is often the only copy of the fix.
 */
export function RawJsonEditor({ text, onCommit, onClose }: Props) {
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  return (
    <div className="app">
      <div className="lhead">
        <div className="vtop">
          <button type="button" className="back" onClick={onClose} aria-label="Back">
            {'‹'}
          </button>
          <span className="vname">Raw JSON</span>
        </div>
      </div>

      <div className="json">
        <textarea
          className="area mono"
          aria-label="Character JSON"
          spellCheck={false}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(null);
            setSaved(false);
          }}
        />

        {error !== null && (
          <div className="fieldError" role="alert">
            {error}
          </div>
        )}
        {saved && <div className="hint">Saved.</div>}

        <div className="hint" style={{ marginTop: 0 }}>
          {/* Spec §5: changing `id` either collides with another character or orphans this one.
              `schemaVersion` stays editable — lowering it just re-runs the migrations. */}
          Editing <code>id</code> is rejected. Lowering <code>schemaVersion</code> re-runs the
          migrations on commit.
        </div>

        <div className="jsonbar">
          <button type="button" className="secondary" onClick={() => setDraft(text)}>
            Revert
          </button>
          <span className="spacer" />
          <button
            type="button"
            className="primary"
            onClick={() => {
              // Awaited, because a real commit goes to IndexedDB. Declared as
              // `NameResult | Promise<NameResult>` rather than always-async so a story or a test
              // can still hand over a plain function and assert synchronously.
              void Promise.resolve(onCommit(draft)).then((failure) => {
                setError(failure);
                setSaved(failure === null);
              });
            }}
          >
            Commit
          </button>
        </div>
      </div>
    </div>
  );
}
