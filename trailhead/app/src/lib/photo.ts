/** Shrinks a photo in the browser before it is sent: the longest side is capped and the picture is drawn again on a
 * canvas, which drops EXIF, GPS and camera details. The server re-encodes it too, so nothing hidden is stored. */

export const PHOTO_MAX_SIDE = 1600;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** The size to draw a picture at so its longest side is at most `max`. Never scales up. */
export function fitWithin(width: number, height: number, max: number = PHOTO_MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function photoProblem(file: File): string | null {
  if (!PHOTO_TYPES.includes(file.type)) {
    return 'Choose a JPEG, PNG or WebP photo.';
  }
  return file.size > 20 * 1024 * 1024 ? 'Choose a photo under 20 MB.' : null;
}

/** The base64 (no prefix) of a JPEG copy of the photo, at most PHOTO_MAX_SIDE on a side. */
export async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const size = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('This browser could not prepare the photo.');
  }
  context.fillStyle = '#fff';
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return url.slice(url.indexOf(',') + 1);
}
