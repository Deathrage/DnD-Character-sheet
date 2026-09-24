import { z } from 'zod';

/**
 * Characters of data URL, about 23 KB of image. Strict because the cloud copy will live in
 * Firestore, whose free tier caps total storage; the encoder aims for 24 000, so this is headroom.
 */
export const MAX_PORTRAIT = 32_000;

/**
 * A character portrait: a base64 JPEG data URL, ready to be an `<img src>`.
 *
 * Not part of the character document, and so not versioned with it. It is stored beside the
 * document (its own IndexedDB store, keyed by character id) because a 20 KB string inside the
 * document made the raw-JSON editor unusable, and because the cloud copy will be two Firestore
 * documents anyway. A rule change here must still only ever widen what it accepts: exported files
 * carry a portrait, and a file that imported yesterday must import tomorrow.
 *
 * JPEG only, so a portrait is the same format whichever browser made it — Safari's canvas cannot
 * encode WebP — and so a hand-edited file cannot smuggle in an SVG, which can carry script.
 */
export const portraitSchema = z
  .string()
  .max(MAX_PORTRAIT)
  .regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/, 'must be a base64 JPEG');
