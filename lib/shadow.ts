import { boxBlur, type Raster } from "./raster";

export type ShadowOptions = {
  /** How flat the cast shadow is: 0 = a line at the base, 1 = the full silhouette. */
  squash?: number;
  /** Blur radius as a fraction of the subject's width. */
  softness?: number;
  /** Peak darkness, 0–1. */
  opacity?: number;
};

/**
 * A soft contact shadow for a subject standing on a surface: the matte's silhouette is
 * flattened onto the ground at its lowest point, then blurred. Returns one alpha value per
 * pixel, in the same coordinates as the matte.
 * shortcut: assumes light from above and a subject resting on its bottom edge; add a light direction when relight lands.
 */
export function contactShadow(matte: Raster, { squash = 0.12, softness = 0.03, opacity = 0.55 }: ShadowOptions = {}): Uint8ClampedArray {
  const { width, height, data } = matte;
  let bottom = -1;
  for (let i = data.length - 1; i >= 0 && bottom < 0; i -= 4) if (data[i] > 0) bottom = Math.floor((i >> 2) / width);
  const plane = new Float32Array(width * height);
  if (bottom < 0) return new Uint8ClampedArray(plane.length);

  for (let y = 0; y <= bottom; y++) {
    const gy = Math.round(bottom - (bottom - y) * squash);
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > plane[gy * width + x]) plane[gy * width + x] = a;
    }
  }
  const blurred = boxBlur(plane, width, height, Math.max(1, width * softness));
  const out = new Uint8ClampedArray(plane.length);
  for (let i = 0; i < out.length; i++) out[i] = blurred[i] * opacity;
  return out;
}
