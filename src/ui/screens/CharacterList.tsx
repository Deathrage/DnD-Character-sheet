import type { CharacterRow, ClassSummaryView, HitPointsView } from '../types.js';

interface Props {
  rows: CharacterRow[];
  onOpen(id: string): void;
  /** A damaged document's only action (criterion 15): the raw JSON, for hand-repair. */
  onOpenRawJson(id: string): void;
  onCreate(): void;
  onImport(): void;
}

export function CharacterList({ rows, onOpen, onOpenRawJson, onCreate, onImport }: Props) {
  return (
    <div className="app">
      <div className="lhead">
        <div className="vtop">
          <h1>Characters</h1>
          <button
            type="button"
            className="txtbtn"
            style={{ marginLeft: 'auto' }}
            onClick={onImport}
          >
            Import
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
          </li>
        ))}
      </ul>

      <button type="button" className="fab" onClick={onCreate} aria-label="New character">
        +
      </button>
    </div>
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
