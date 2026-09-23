import { useState, type ReactNode } from 'react';
import { ResponsiveDialog } from './ResponsiveDialog.js';

interface Props {
  /** What goes, in the confirm dialog's words: "Longsword", "Day 3", "the Rogue class". */
  what: string;
  onConfirm(): void;
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
}

/**
 * A delete button that asks first. Nothing in a character has undo (spec §6), so every delete
 * goes through this rather than acting on the first tap.
 */
export function ConfirmDelete({ what, onConfirm, className = 'del', children, ...rest }: Props) {
  const [asking, setAsking] = useState(false);
  return (
    <>
      <button
        type="button"
        className={className}
        aria-label={rest['aria-label']}
        onClick={() => setAsking(true)}
      >
        {children}
      </button>
      {asking && (
        <ResponsiveDialog
          title="Delete?"
          open
          onClose={() => setAsking(false)}
          footer={
            <>
              <button type="button" className="secondary" onClick={() => setAsking(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="del"
                onClick={() => {
                  setAsking(false);
                  onConfirm();
                }}
              >
                Delete
              </button>
            </>
          }
        >
          <p className="hint" style={{ marginTop: 0 }}>
            {what} will be deleted. This cannot be undone.
          </p>
        </ResponsiveDialog>
      )}
    </>
  );
}
