import { useEffect, useSyncExternalStore } from 'react';
import type { InstallView } from './types.js';

/**
 * Installing the app, which is the lever that actually moves `persist()` in the browsers that
 * decide it silently. A browser affordance like file download, not a rule, so it lives in `ui`.
 *
 * Only Chromium lets a page start an install (`beforeinstallprompt`). Safari, iOS and Firefox for
 * Android can install but never tell the page, so for them the best the app can do is name the
 * steps — which means guessing the browser from its user agent. Desktop Firefox cannot install at
 * all; there `persist()` is a real permission prompt and needs no install.
 */
export type Browser = 'chromium' | 'firefox' | 'firefoxAndroid' | 'safari' | 'ios' | 'other';

export function detectBrowser(userAgent: string, maxTouchPoints: number): Browser {
  // iOS first: Chrome and Firefox there carry their own tokens but are WebKit and install like
  // Safari. iPadOS sends the Mac string by default; only its touch points give it away.
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) {
    return 'ios';
  }
  if (/Firefox\//.test(userAgent)) return /Android/.test(userAgent) ? 'firefoxAndroid' : 'firefox';
  if (/Chrome\/|Chromium\//.test(userAgent)) return 'chromium';
  if (/Macintosh/.test(userAgent) && /Safari\//.test(userAgent)) return 'safari';
  return 'other';
}

/** How to install by hand, or `null` where this browser cannot install the app at all. */
export function installSteps(browser: Browser): string | null {
  switch (browser) {
    case 'chromium':
      return 'Click the install icon at the right end of the address bar, or open the browser menu and choose Install (on a phone: Add to Home screen). Then open the app from its new icon.';
    case 'firefoxAndroid':
      return 'Open the browser menu (⋮) and choose Add to Home screen, then open the app from its new icon.';
    case 'safari':
      return 'In the menu bar choose File → Add to Dock, then open the app from the Dock.';
    case 'ios':
      return 'Tap the Share button, choose Add to Home Screen, then open the app from its Home Screen icon.';
    case 'firefox':
    case 'other':
      return null;
  }
}

/** Chromium's event, which TypeScript's DOM library does not declare. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function runningInstalled(): boolean {
  return (
    globalThis.matchMedia?.('(display-mode: standalone)').matches === true ||
    (globalThis.navigator as { standalone?: boolean } | undefined)?.standalone === true
  );
}

/**
 * Module state, not component state: Chromium fires `beforeinstallprompt` once, early, and the app
 * does not render until storage has loaded — a listener registered by a component would miss it.
 * Replaced whole on every change so `useSyncExternalStore` sees a new snapshot.
 */
let state = { deferred: null as BeforeInstallPromptEvent | null, installed: runningInstalled() };
const listeners = new Set<() => void>();

function set(next: typeof state): void {
  state = next;
  for (const listener of listeners) listener();
}

globalThis.addEventListener?.('beforeinstallprompt', (event) => {
  // Suppresses Chrome's own mini-infobar on Android: the app offers its own button instead.
  event.preventDefault();
  set({ ...state, deferred: event as BeforeInstallPromptEvent });
});
globalThis.addEventListener?.('appinstalled', () => set({ deferred: null, installed: true }));

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * What the app can offer right now, and the action behind it. `onInstalled` runs once the browser
 * reports the install, so the caller can ask for persistence again straight away.
 */
export function useInstall(onInstalled: () => void): {
  view: InstallView;
  /** Firefox asks the player itself, so a refusal there is a blocked permission, not a verdict. */
  asksPermission: boolean;
  install(): void;
} {
  const { deferred, installed } = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    globalThis.addEventListener?.('appinstalled', onInstalled);
    return () => globalThis.removeEventListener?.('appinstalled', onInstalled);
  }, [onInstalled]);

  const browser = detectBrowser(
    globalThis.navigator?.userAgent ?? '',
    globalThis.navigator?.maxTouchPoints ?? 0,
  );
  const steps = installSteps(browser);
  const view: InstallView = installed
    ? { kind: 'installed' }
    : deferred !== null
      ? { kind: 'prompt' }
      : steps !== null
        ? { kind: 'steps', steps }
        : { kind: 'unavailable' };

  return {
    view,
    asksPermission: browser === 'firefox' || browser === 'firefoxAndroid',
    install: () => {
      if (deferred === null) return;
      // A prompt can be shown once; after it, Chromium fires a fresh event if it may ask again.
      set({ ...state, deferred: null });
      void deferred.prompt();
    },
  };
}
