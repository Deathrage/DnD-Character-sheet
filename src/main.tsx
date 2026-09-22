import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CharacterLibraryBO } from './business/index.js';
import { App } from './ui/App.js';
import './ui/styles.css';

/**
 * The composition root, and the only place the real `CharacterLibraryBO` is constructed — which
 * is what makes it the only place the real IndexedDB repository and the real
 * `navigator.storage` are reached. Everything below takes them as arguments.
 */
const root = document.getElementById('root');
if (root === null) {
  throw new Error('#root is missing from index.html');
}

createRoot(root).render(
  <StrictMode>
    <App library={new CharacterLibraryBO()} />
  </StrictMode>,
);
