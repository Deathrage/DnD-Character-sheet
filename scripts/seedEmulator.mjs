/**
 * Seeds the local Firebase emulators for `npm run dev:cloud`: one Google account, "Dev Player",
 * whose cloud already holds Zahir ibn Talaar in two versions.
 *
 * Written through the emulators' REST APIs with `Authorization: Bearer owner`, the emulator's admin
 * bypass — so the seed skips `firestore.rules`, and the app, which never sends that header, does
 * not. No Admin SDK: two `fetch` calls per document are a smaller thing to own than a dependency.
 *
 * The document is laid out exactly as `src/data/remote/cloudStore.ts` writes it: `cloud/{uid}`
 * holding `{ layoutVersion: 2, characters: { [id]: { [uploadedAt]: { sheet, portrait: null } } } }`,
 * the sheet gzipped as Bytes. If that layout changes, change this with it.
 *
 * Hosts come from the environment variables `firebase emulators:exec` sets for its child —
 * `FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST`, both `host:port` with no scheme —
 * falling back to the ports `npm run dev:cloud` runs on.
 */
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

const PROJECT = 'dnd-character-sheet-64a24';
const AUTH = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`;
const FIRESTORE = `http://${process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'}`;
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

const integer = (value) => ({ integerValue: String(value) });
const bytesValue = (buffer) => ({ bytesValue: buffer.toString('base64') });
const map = (fields) => ({ mapValue: { fields } });

/** Every version in one write: layout 2 is one document per player. */
async function seedCloud(uid, versions) {
  const byCharacter = {};
  for (const { doc, uploadedAt } of versions) {
    byCharacter[doc.id] ??= {};
    byCharacter[doc.id][uploadedAt] = map({
      sheet: bytesValue(gzipSync(JSON.stringify(doc))),
      portrait: { nullValue: null },
    });
  }
  const characters = Object.fromEntries(
    Object.entries(byCharacter).map(([id, entries]) => [id, map(entries)]),
  );
  const path = `${FIRESTORE}/v1/projects/${PROJECT}/databases/(default)/documents/cloud/${uid}`;
  await call(path, 'PATCH', {
    fields: { layoutVersion: integer(2), characters: map(characters) },
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
await seedCloud(PLAYER.localId, [
  { doc: older, uploadedAt: '2026-09-16T21:00:00.000Z' },
  { doc: zahir, uploadedAt: '2026-09-23T15:00:00.000Z' },
]);
console.log(`Seeded ${PLAYER.displayName} <${PLAYER.email}> with ${zahir.name} (2 versions).`);
