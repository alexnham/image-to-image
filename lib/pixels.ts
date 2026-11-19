import type { Raster } from "./raster";
/** Only editable pixels are merged; model masks alone cannot protect the original. */
export function mergeRegion(
  original: Raster,
  edited: Raster,
  editable: Uint8ClampedArray,
): Raster {
  if (
    original.width !== edited.width ||
    original.height !== edited.height ||
    editable.length !== original.width * original.height
  )
    throw new Error("Image size mismatch");
  const data = original.data.slice();
  for (let i = 0; i < editable.length; i++) {
    const alpha = editable[i] / 255;
    if (!alpha) continue;
    for (let c = 0; c < 3; c++)
      data[i * 4 + c] =
        original.data[i * 4 + c] * (1 - alpha) + edited.data[i * 4 + c] * alpha;
  }
  return { ...original, data };
}
export function extractSubject(
  original: Raster,
  mask: Uint8ClampedArray,
): Raster {
  if (mask.length !== original.width * original.height)
    throw new Error("Mask size mismatch");
  const data = original.data.slice();
  for (let i = 0; i < mask.length; i++)
    data[i * 4 + 3] = Math.round((original.data[i * 4 + 3] * mask[i]) / 255);
  return { ...original, data };
}

export function adjustPixels(
  data: Uint8ClampedArray,
  adjust: {
    brightness: number;
    contrast: number;
    saturation: number;
    warmth: number;
    grain: number;
  },
) {
  const { brightness, contrast, saturation, warmth, grain } = adjust;
  if (!brightness && !contrast && !saturation && !warmth && !grain) return;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2],
      lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const noise =
      ((((i * 1664525 + 1013904223) >>> 0) % 65536) / 65535 - 0.5) * grain * 36;
    for (let c = 0; c < 3; c++)
      data[i + c] =
        (lum +
          ((c === 0 ? r : c === 1 ? g : b) - lum) * (1 + saturation) -
          128) *
          (1 + contrast) +
        128 +
        brightness * 100 +
        (c === 0 ? warmth * 22 : c === 2 ? -warmth * 22 : 0) +
        noise;
  }
}

export function overlapsMask(
  box: { x: number; y: number; w: number; h: number },
  mask: Uint8ClampedArray,
  width: number,
  height: number,
) {
  for (
    let y = Math.max(0, Math.floor(box.y * height));
    y < Math.min(height, Math.ceil((box.y + box.h) * height));
    y++
  )
    for (
      let x = Math.max(0, Math.floor(box.x * width));
      x < Math.min(width, Math.ceil((box.x + box.w) * width));
      x++
    )
      if (mask[y * width + x] > 32) return true;
  return false;
}

/** Bounds of visible subject pixels, excluding near-transparent detector noise. */
export function subjectBounds(raster: Raster) {
  let left = raster.width,
    top = raster.height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < raster.height; y++)
    for (let x = 0; x < raster.width; x++)
      if (raster.data[(y * raster.width + x) * 4 + 3] > 8) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  return right < left
    ? null
    : { left, top, width: right - left + 1, height: bottom - top + 1 };
}
