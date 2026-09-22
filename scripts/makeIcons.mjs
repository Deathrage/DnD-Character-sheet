/**
 * Writes the PWA icons into `public/`.
 *
 * Committed rather than run once and forgotten, because the icon takes its colour from
 * `src/ui/styles.css`'s `--accent`. Without the script that link is a comment nobody honours, and
 * the first palette change leaves an icon that no longer matches the app. Run it with
 * `node scripts/makeIcons.mjs`.
 *
 * No image library. A PNG is a signature, three chunks and a CRC, and `node:zlib` does the only
 * hard part — which is a smaller thing to own than a dependency that pulls in native binaries for
 * two flat-coloured squares.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ACCENT = [0x6d, 0x6f, 0xf0]; // --accent in src/ui/styles.css
const PAPER = [0xff, 0xff, 0xff]; // --paper

/**
 * The d20 silhouette: a point-topped hexagon with an upward triangle knocked out of it, which is
 * what an icosahedron looks like face-on and what reads as "dice" at 48px.
 *
 * Kept inside 60% of the canvas so one set of icons serves both `any` and `maskable`: a maskable
 * icon may be cropped to a circle of 80% of the width, and anything inside that is safe.
 */
const HEX_RADIUS = 0.3;
const INNER_RADIUS = 0.165;

function regularPolygon(cx, cy, radius, sides, rotationDeg) {
  const rotation = (rotationDeg * Math.PI) / 180;
  return Array.from({ length: sides }, (_, index) => {
    const angle = rotation + (index * 2 * Math.PI) / sides;
    return [cx + radius * Math.cos(angle), cy - radius * Math.sin(angle)];
  });
}

function inside(points, x, y) {
  let result = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
  }
  return result;
}

/** 3x3 supersampling, because a hard polygon edge on a 192px icon is visibly jagged otherwise. */
function coverage(points, x, y, size) {
  let hits = 0;
  for (let sy = 0; sy < 3; sy++) {
    for (let sx = 0; sx < 3; sx++) {
      if (inside(points, (x + (sx + 0.5) / 3) / size, (y + (sy + 0.5) / 3) / size)) hits++;
    }
  }
  return hits / 9;
}

const mix = (from, to, amount) =>
  from.map((channel, i) => Math.round(channel + (to[i] - channel) * amount));

function render(size) {
  const hex = regularPolygon(0.5, 0.5, HEX_RADIUS, 6, 90);
  const inner = regularPolygon(0.5, 0.52, INNER_RADIUS, 3, 90);
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const onHex = coverage(hex, x, y, size);
      const onInner = coverage(inner, x, y, size);
      // Accent ground, white die, accent again for the face knocked out of its middle.
      let colour = mix(ACCENT, PAPER, onHex);
      colour = mix(colour, ACCENT, onInner);
      const at = (y * size + x) * 4;
      pixels[at] = colour[0];
      pixels[at + 1] = colour[1];
      pixels[at + 2] = colour[2];
      pixels[at + 3] = 0xff;
    }
  }
  return pixels;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(size, pixels) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  // 10..12 stay zero: deflate, adaptive filtering, no interlace.

  // One filter byte per scanline, filter type 0 (None) — the image is flat colour, so the
  // fancier filters buy nothing that deflate does not already get.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(out, { recursive: true });
for (const size of [192, 512]) {
  const file = join(out, `icon-${size}.png`);
  writeFileSync(file, png(size, render(size)));
  console.log(`wrote ${file}`);
}
