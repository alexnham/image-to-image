export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_EDGE = 2048;
// What the blob store accepts after the browser has converted and resized the upload.
export const STORED_TYPES = ["image/jpeg", "image/png", "image/webp"];

const HEIC_NAME = /\.(heic|heif)$/i;

export function isHeic(file: { type: string; name: string }) {
  return file.type === "image/heic" || file.type === "image/heif" || HEIC_NAME.test(file.name);
}

/** Returns a user-facing error, or null when the file can be uploaded. */
export function validateFile(file: { type: string; name: string; size: number }): string | null {
  if (!STORED_TYPES.includes(file.type) && !isHeic(file)) {
    return "Please upload a JPEG, PNG, WebP or HEIC image.";
  }
  if (file.size > MAX_UPLOAD_BYTES) return "That image is over 20MB.";
  return null;
}

export function fitWithin(width: number, height: number, max = MAX_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Browser only. Decodes (HEIC included), applies EXIF rotation, downscales to MAX_EDGE
 * and re-encodes, which also strips metadata such as GPS location.
 */
export async function prepareImage(file: File): Promise<Blob> {
  const bitmap = isHeic(file)
    ? await (await import("heic-to")).heicTo({ blob: file, type: "bitmap" })
    : await createImageBitmap(file);
  const { width, height } = fitWithin(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  // PNG keeps transparency; everything else becomes JPEG.
  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  return canvas.convertToBlob({ type, quality: 0.92 });
}
