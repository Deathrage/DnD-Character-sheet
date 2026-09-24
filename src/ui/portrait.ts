/** Edge of the square the portrait is cropped to: sharp in the dialog's large view. */
const EDGE = 384;
/**
 * Data URL characters, about 17 KB of image. Tight on purpose: the cloud copy will live in
 * Firestore, whose free tier caps total storage, and this is the one part of a character whose
 * size the app, not the player, decides. Even pure random noise — JPEG's worst case — fits at
 * 384px (measured: ~16 000 characters at the lowest quality step).
 */
const TARGET = 24_000;

/**
 * Turns a picked image file into a small square JPEG data URL: centre-cropped, scaled to 384px,
 * stepping the quality down until it fits the target.
 *
 * JPEG rather than WebP because every browser's canvas encodes it — Safari's cannot encode WebP —
 * so a portrait is the same format whichever browser made it.
 *
 * @throws when the file is not an image the browser can decode.
 */
export async function compressPortrait(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = Math.min(EDGE, side);
  const context = canvas.getContext('2d')!;
  // JPEG has no alpha: without this, a transparent PNG's background would encode as black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  bitmap.close();

  let url = '';
  for (let quality = 0.85; quality > 0.2; quality -= 0.15) {
    url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= TARGET) break;
  }
  return url;
}
