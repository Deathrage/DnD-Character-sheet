import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CharacterLibraryBO } from './business/index.js';
import { App } from './ui/App.js';
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
    <App library={library} />
  </StrictMode>,
);
