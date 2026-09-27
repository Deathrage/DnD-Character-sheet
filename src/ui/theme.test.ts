// @vitest-environment jsdom
import { applyTheme, storedTheme } from './theme.js';

beforeEach(() => {
  localStorage.clear();
  document.head.innerHTML = `
    <meta name="theme-color" content="#000" media="(prefers-color-scheme: dark)" data-scheme="dark" />
    <meta name="theme-color" content="#fff" media="(prefers-color-scheme: light)" data-scheme="light" />`;
});

const media = () =>
  [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')].map((m) => m.media);

describe('applyTheme', () => {
  it("pins the chosen scheme's toolbar colour and switches the other off", () => {
    applyTheme('light');
    expect(media()).toEqual(['not all', 'all']);
    applyTheme('dark');
    expect(media()).toEqual(['all', 'not all']);
  });

  it('hands both toolbar colours back to the device on system', () => {
    applyTheme('dark');
    applyTheme('system');
    expect(media()).toEqual(['(prefers-color-scheme: dark)', '(prefers-color-scheme: light)']);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});

describe('storedTheme', () => {
  it('reads a stored choice', () => {
    localStorage.setItem('ui:theme', '"dark"');
    expect(storedTheme()).toBe('dark');
  });

  // A hand-edited value would otherwise set a `data-theme` no rule matches.
  it.each(['"blue"', '3', 'not json'])('falls back to system for %s', (stored) => {
    localStorage.setItem('ui:theme', stored);
    expect(storedTheme()).toBe('system');
  });
});
