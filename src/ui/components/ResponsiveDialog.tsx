import { useEffect, useRef, type ReactNode } from 'react';

interface Props {
  title: string;
  open: boolean;
  onClose(): void;
  /**
   * The persistence gate (spec §5): no close button, no Escape. Everything else is dismissible
   * both ways. No dialog closes on a backdrop click.
   */
  blocking?: boolean;
  children: ReactNode;
  /** The action row. Left out entirely when a dialog has no actions. */
  footer?: ReactNode;
}

/**
 * One dialog, two presentations: a bottom sheet below 640px, the wireframe's centred modal at
 * 640px and above (spec §7). The split is entirely in CSS — see the two media queries on
 * `.dialog` in `../styles.css` — so there is no `matchMedia` here, no listener to leak, and no
 * remount when the window crosses the breakpoint mid-edit.
 *
 * It is a native `<dialog>` opened with `showModal()`, which is what supplies the focus trap,
 * the inert background, Escape-to-close and the top-layer stacking. Hand-rolling those is the
 * standard way to end up with a dialog that is almost accessible.
 */
export function ResponsiveDialog({ title, open, onClose, blocking, children, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // `showModal()` on an already-open dialog throws, and `close()` on a closed one fires a
    // spurious `close` event, so both are guarded by the element's own state rather than by
    // tracking the previous prop.
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-label={title}
      // `cancel` covers Escape and the platform's own dismiss gesture. A click on the backdrop
      // deliberately does not close: a stray tap outside a half-filled form would lose it.
      onCancel={(event) => {
        // React propagates `cancel` up its own tree although the DOM event does not bubble, so
        // Escape on a nested confirm dialog would otherwise close the dialog beneath it too.
        if (event.target !== event.currentTarget) return;
        if (blocking) event.preventDefault();
        else onClose();
      }}
    >
      <div className="dhead">
        <span className="t">{title}</span>
        {!blocking && (
          <button type="button" className="close" onClick={onClose} aria-label="Close">
            {'×'}
          </button>
        )}
      </div>
      {children}
      {footer !== undefined && <div className="dact">{footer}</div>}
    </dialog>
  );
}
