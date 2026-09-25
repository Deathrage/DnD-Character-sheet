import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CharacterLibraryBO, CloudBackup } from './business/index.js';
import { App } from './ui/App.js';
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
    <UpdatePrompt beforeReload={() => library.flush()} />
    <App library={library} cloud={cloud} />
  </StrictMode>,
);
