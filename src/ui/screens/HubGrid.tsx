import { SECTIONS, WIRED_SECTIONS, type SectionKey } from '../types.js';

interface Props {
  onOpen(section: SectionKey): void;
  onExport(): void;
  onOpenRawJson(): void;
  /** Which tiles are live. The first slice wires one; the other six render inert. */
  wired?: readonly SectionKey[];
}

export function HubGrid({ onOpen, onExport, onOpenRawJson, wired = WIRED_SECTIONS }: Props) {
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
      </div>
    </div>
  );
}
