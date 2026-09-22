import { useState } from 'react';
import { ResponsiveDialog } from '../components/ResponsiveDialog.js';
import type { JournalAndNotesActions, JournalAndNotesView } from '../types.js';

interface Props {
  data: JournalAndNotesView;
  actions: JournalAndNotesActions;
  onClose(): void;
}

/**
 * The journal is a queue where the array index *is* the day index (`Model.ts`). That single fact
 * shapes this whole screen: days are added at the end and only the newest can be deleted,
 * because removing any other index would renumber every day after it. So there is one add
 * button, and the Delete button appears in one dialog only — the last day's.
 */
export function JournalAndNotes({ data, actions, onClose }: Props) {
  const [openDay, setOpenDay] = useState<number | null>(null);
  const newest = data.days.length - 1;
  const current = openDay !== null ? data.days[openDay] : undefined;

  return (
    <div className="bottom">
      <div className="sv">
        <div className="svhead">
          <span className="t">Journal &amp; Notes</span>
          <button type="button" className="close" onClick={onClose} aria-label="Back to sections">
            {'×'}
          </button>
        </div>

        <div className="sechead-row">
          <span className="sechead static">Journal</span>
          <button
            type="button"
            className="addmini"
            aria-label="Add day"
            onClick={() => {
              actions.appendDay();
              // The new day is the one just appended, so it opens straight into its editor —
              // an empty day button you then have to find and tap is a pointless second step.
              setOpenDay(data.days.length);
            }}
          >
            +
          </button>
        </div>
        {data.days.length === 0 ? (
          <div className="empty">No entries yet</div>
        ) : (
          <div className="daygrid">
            {data.days.map((_, index) => (
              <button
                type="button"
                key={index}
                className={index === newest ? 'daybtn newest' : 'daybtn'}
                onClick={() => setOpenDay(index)}
              >
                Day {index + 1}
              </button>
            ))}
          </div>
        )}

        <div className="sechead-row">
          <span className="sechead static">Notes</span>
        </div>
        <textarea
          className="area"
          aria-label="Notes"
          rows={8}
          placeholder={'Freeform notes…'}
          value={data.notes}
          onChange={(event) => actions.setNotes(event.target.value)}
        />
      </div>

      {openDay !== null && current !== undefined && (
        <ResponsiveDialog
          title={`Day ${openDay + 1}`}
          open
          onClose={() => setOpenDay(null)}
          footer={
            openDay === newest ? (
              <button
                type="button"
                className="del"
                onClick={() => {
                  actions.deleteNewestDay();
                  setOpenDay(null);
                }}
              >
                Delete day
              </button>
            ) : undefined
          }
        >
          <textarea
            className="area"
            aria-label={`Day ${openDay + 1} entry`}
            rows={8}
            placeholder={'What happened…'}
            value={current}
            onChange={(event) => actions.setDayText(openDay, event.target.value)}
          />
          {openDay !== newest && (
            <div className="hint">
              Only the newest day can be deleted — the index is the day number, so removing an
              earlier one would renumber every day after it.
            </div>
          )}
        </ResponsiveDialog>
      )}
    </div>
  );
}
