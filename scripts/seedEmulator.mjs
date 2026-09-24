/**
 * Seeds the local Firebase emulators for `npm run dev:cloud`: one Google account, "Dev Player",
 * whose cloud already holds Zahir ibn Talaar in two versions.
 *
 * Written through the emulators' REST APIs with `Authorization: Bearer owner`, the emulator's admin
 * bypass — so the seed skips `firestore.rules`, and the app, which never sends that header, does
 * not. No Admin SDK: two `fetch` calls per document are a smaller thing to own than a dependency.
 *
 * The documents are laid out exactly as `src/data/remote/firestoreRepository.ts` writes them —
 * `users/{uid}/characters/{id}` holding `{ versions: { [uploadedAt]: entry } }`, and
 * `.../payloads/{uploadedAt}` holding the gzipped sheet as Bytes — so restoring one exercises the
 * real decode path. If that layout changes, change this with it.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const PROJECT = 'dnd-character-sheet-64a24';
const AUTH = 'http://127.0.0.1:9099';
const FIRESTORE = 'http://127.0.0.1:8080';
const ADMIN = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

const PLAYER = {
  localId: 'dev-player',
  email: 'dev.player@example.com',
  displayName: 'Dev Player',
};

async function call(url, method, body) {
  const response = await fetch(url, { method, headers: ADMIN, body: JSON.stringify(body) });
  if (!response.ok)
    throw new Error(`${method} ${url}: ${response.status} ${await response.text()}`);
}

/** A Google-provider account, so it is offered by the emulator's sign-in popup. */
async function seedPlayer() {
  await call(
    `${AUTH}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:batchCreate`,
    'POST',
    {
      users: [
        {
          ...PLAYER,
          emailVerified: true,
          providerUserInfo: [{ providerId: 'google.com', rawId: PLAYER.localId, ...PLAYER }],
        },
      ],
    },
  );
}

const string = (value) => ({ stringValue: value });
const integer = (value) => ({ integerValue: String(value) });

async function seedVersion(uid, doc, uploadedAt) {
  const sheet = gzipSync(JSON.stringify(doc));
  const classes = doc.classes.map(({ name, level }) => ({
    mapValue: { fields: { name: string(name), level: integer(level) } },
  }));
  const character = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/users/${uid}/characters/${doc.id}`;

  await call(`${character}/payloads/${encodeURIComponent(uploadedAt)}`, 'PATCH', {
    fields: { sheet: { bytesValue: sheet.toString('base64') }, portrait: { nullValue: null } },
  });
  // `updateMask` on this one key, so the second version merges beside the first — as the app's
  // `set(..., { merge: true })` does — instead of replacing the whole map.
  const mask = `updateMask.fieldPaths=${encodeURIComponent(`versions.\`${uploadedAt}\``)}`;
  await call(`${character}?${mask}`, 'PATCH', {
    fields: {
      versions: {
        mapValue: {
          fields: {
            [uploadedAt]: {
              mapValue: {
                fields: {
                  name: string(doc.name),
                  classes: { arrayValue: { values: classes } },
                  totalLevel: integer(doc.classes.reduce((total, c) => total + c.level, 0)),
                  sheetUpdatedAt: string(doc.updatedAt),
                  schemaVersion: integer(doc.schemaVersion),
                  bytes: integer(sheet.byteLength),
                },
              },
            },
          },
        },
      },
    },
  });
}

const zahir = JSON.parse(
  readFileSync(new URL('../testAssets/zahir-ibn-talaar-2026-09-24.json', import.meta.url), 'utf8'),
).sheet;
// An older version one level down, so the cloud screen has two to tell apart.
const older = {
  ...zahir,
  classes: zahir.classes.map((c, index) => (index === 0 ? { ...c, level: c.level - 1 } : c)),
  updatedAt: '2026-09-16T19:30:00.000Z',
};

await seedPlayer();
await seedVersion(PLAYER.localId, older, '2026-09-16T21:00:00.000Z');
await seedVersion(PLAYER.localId, zahir, '2026-09-23T15:00:00.000Z');
console.log(`Seeded ${PLAYER.displayName} <${PLAYER.email}> with ${zahir.name} (2 versions).`);
