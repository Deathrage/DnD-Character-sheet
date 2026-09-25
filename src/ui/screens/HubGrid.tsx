import { SECTIONS, WIRED_SECTIONS, type SectionKey } from '../types.js';

interface Props {
  onOpen(section: SectionKey): void;
  onExport(): void;
  onOpenRawJson(): void;
  /** Which tiles are live. The first slice wires one; the other six render inert. */
  wired?: readonly SectionKey[];
  /** Absent hides the button — the stories and any screen without a cloud. */
  onUpload?(): void;
  /** The last upload's line: "Uploaded 24 Sep, 18:03" or the reason it failed. */
  uploadNotice?: string | null;
  /** Signed out, or the sign-in check still running: the button is shown but cannot be pressed. */
  uploadDisabled?: boolean;
  /**
   * Why it is disabled, when there is something to say. Both a tooltip and a visible line: a
   * phone has no hover, so a tooltip alone would never be seen there.
   */
  uploadHint?: string | null;
}

export function HubGrid({
  onOpen,
  onExport,
  onOpenRawJson,
  wired = WIRED_SECTIONS,
  onUpload,
  uploadDisabled = false,
  uploadHint = null,
  uploadNotice,
}: Props) {
  return (
    <div className="bottom">
      <ul className="menu">
        {SECTIONS.map((section) => {
          const enabled = wired.includes(section.key);
          return (
            <li key={section.key}>
              <button
                type="button"
                className="mtile"
                // `aria-disabled` rather than `disabled`: the tile is present and readable —
                // it is the map of what this character sheet holds — it just does not go
                // anywhere yet. A `disabled` button is skipped by the tab order, which would
                // hide six of the seven sections from a keyboard or screen reader entirely.
                aria-disabled={!enabled}
                onClick={() => {
                  if (enabled) onOpen(section.key);
                }}
              >
                <span className="ico" aria-hidden="true">
                  {section.icon}
                </span>
                <span className="mt">{section.title}</span>
                <span className="ms">{enabled ? section.subtitle : 'not built yet'}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="sv" style={{ paddingTop: 0 }}>
        <button type="button" className="newcat" onClick={onExport}>
          Export this character as .json
        </button>
        <button type="button" className="newcat" onClick={onOpenRawJson}>
          Open raw JSON
        </button>
        {onUpload !== undefined && (
          <button
            type="button"
            className="newcat"
            disabled={uploadDisabled}
            {...(uploadDisabled && uploadHint !== null ? { title: uploadHint } : {})}
            onClick={onUpload}
          >
            Upload to cloud
          </button>
        )}
        {uploadDisabled && uploadHint !== null && <p className="hint btnhint">{uploadHint}</p>}
        {uploadNotice != null && <p className="hint">{uploadNotice}</p>}
      </div>
    </div>
  );
}
