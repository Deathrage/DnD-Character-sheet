import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CharacterLibraryBO, CloudBackup } from './business/index.js';
import { App } from './ui/App.js';
import { Diagnostics } from './ui/diagnostics/index.js';
import { applyTheme, storedTheme } from './ui/theme.js';
import { UpdatePrompt } from './ui/UpdatePrompt.js';
import './ui/styles.css';

/**
 * The composition root, and the only place the real `CharacterLibraryBO` is constructed — which is
 * what makes it the only place the real IndexedDB repository and the real `navigator.storage` are
 * reached. Everything below takes them as arguments.
 */
const root = document.getElementById('root');
if (root === null) {
  throw new Error('#root is missing from index.html');
}

// Before anything renders, so a chosen theme is on the page from the first frame.
applyTheme(storedTheme());
// Before anything renders too: with diagnostics on, a launch is recorded from its first frames.
const diagnostics = new Diagnostics();
diagnostics.startIfOn();

const library = new CharacterLibraryBO();

/** Loads nothing at launch: Firebase is first loaded by opening a sheet or the cloud screen. */
const cloud = new CloudBackup(library);

/**
 * `import.meta.env.DEV` is replaced by Vite with a literal `false` in a production build, so this
 * branch — and with it the whole `devSeed` module, which is only reachable through it — is dropped
 * from the bundle. A static import would have shipped the sample characters to real users.
 *
 * Awaited before the first render so the seed is never half-visible.
 */
if (import.meta.env.DEV) {
  const { seedIfEmpty } = await import('./devSeed.js');
  await seedIfEmpty(library);
}

createRoot(root).render(
  <StrictMode>
    {/* First, so the strip sits above the app and pushes it down (see `#root` in styles.css). */}
    <UpdatePrompt
      beforeReload={async () => {
        await Promise.all([library.flush(), diagnostics.flush()]);
      }}
    />
    <App library={library} cloud={cloud} diagnostics={diagnostics} />
  </StrictMode>,
);
