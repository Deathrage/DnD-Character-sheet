/**
 * jsdom 30 parses `<dialog>` but implements none of its behaviour — no `showModal`, no top layer,
 * no focus trap. Stubbing the two methods is enough for any test that only needs the dialog to be
 * open or closed, which is every test here: the real focus trap and inertness are the browser's,
 * which is the reason for using a native dialog at all, and they are reviewed in Storybook.
 *
 * Shared rather than repeated, because a second copy is how the two drift — and a test whose
 * dialog silently never opens passes by finding nothing.
 */
export function stubDialogElement(): void {
  const proto = HTMLDialogElement.prototype as unknown as Record<string, unknown>;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.open = true;
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close(this: HTMLDialogElement) {
      this.open = false;
    };
  }
}
