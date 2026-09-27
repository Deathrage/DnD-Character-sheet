/**
 * The app's line icons: 24px grid, stroke only, drawn by whatever styles the `svg` they sit in
 * (`.mico svg` in the list's menu, `.centry .ico svg` on the hub). One set, so a cloud is the
 * same cloud in the menu and on a sheet.
 */
export const ICONS = {
  account: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  cloud: (
    <svg viewBox="0 0 24 24">
      <path d="M7 19a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 10a4.5 4.5 0 0 1-.5 9z" />
    </svg>
  ),
  import: (
    <svg viewBox="0 0 24 24">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 11v6M9 14l3 3 3-3" />
    </svg>
  ),
  install: (
    <svg viewBox="0 0 24 24">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M12 7v6M9.5 10.5 12 13l2.5-2.5M11 18h2" />
    </svg>
  ),
  privacy: (
    <svg viewBox="0 0 24 24">
      <path d="M12 3 5 6v5c0 4.5 3 8.5 7 10 4-1.5 7-5.5 7-10V6z" />
    </svg>
  ),
  terms: (
    <svg viewBox="0 0 24 24">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6" />
    </svg>
  ),
  theme: (
    <svg viewBox="0 0 24 24">
      <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" />
    </svg>
  ),
  export: (
    <svg viewBox="0 0 24 24">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 17v-6M9 14l3-3 3 3" />
    </svg>
  ),
  backpack: (
    <svg viewBox="0 0 24 24">
      <path d="M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6" />
      <path d="M5 11a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z" />
      <path d="M8 21v-5a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v5M8 11h8" />
    </svg>
  ),
  stopwatch: (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="14" r="7" />
      <path d="M10 2h4M12 2v5M12 14l3-3M18.5 6.5l1.5-1.5" />
    </svg>
  ),
  json: (
    <svg viewBox="0 0 24 24">
      <path d="M8 4H7a2 2 0 0 0-2 2v4l-2 2 2 2v4a2 2 0 0 0 2 2h1M16 4h1a2 2 0 0 1 2 2v4l2 2-2 2v4a2 2 0 0 1-2 2h-1" />
    </svg>
  ),
};
