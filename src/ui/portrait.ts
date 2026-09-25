/** Edge of the square the portrait is cropped to: sharp in the dialog's large view. */
const EDGE = 384;
/**
 * Data URL characters, about 17 KB of image. Tight on purpose: the cloud copy will live in
 * Firestore, whose free tier caps total storage, and this is the one part of a character whose
 * size the app, not the player, decides. Even pure random noise — JPEG's worst case — fits at
 * 384px (measured: ~16 000 characters at the lowest quality step).
 */
const TARGET = 24_000;

/** The square of the source image to keep, in the image's own pixels. */
export interface Crop {
  x: number;
  y: number;
  side: number;
}

/**
 * Turns a picked image file into a small square JPEG data URL: cropped to the square the player
 * chose, scaled to 384px, stepping the quality down until it fits the target.
 *
 * JPEG rather than WebP because every browser's canvas encodes it — Safari's cannot encode WebP —
 * so a portrait is the same format whichever browser made it.
 *
 * @throws when the file is not an image the browser can decode.
 */
export async function compressPortrait(file: Blob, { x, y, side }: Crop): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.max(1, Math.round(Math.min(EDGE, side)));
  const context = canvas.getContext('2d')!;
  // JPEG has no alpha: without this, a transparent PNG's background would encode as black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, x, y, side, side, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let url = '';
  for (let quality = 0.85; quality > 0.2; quality -= 0.15) {
    url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= TARGET) break;
  }
  return url;
}
