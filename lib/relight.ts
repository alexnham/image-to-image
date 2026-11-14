import { boxBlur, channel, type Raster } from "./raster";

const EPS = 1;

/**
 * Moves only the low-frequency light change from `relit` onto `original`, so fine detail
 * (texture, labels, edges) still comes from the original pixels: out = original × blur(relit) / blur(original).
 * Blurs are weighted by the original's alpha so transparent pixels around the subject don't bleed in.
 */
export function transferLight(original: Raster, relit: Raster, radius = 16): Raster {
  const { width, height } = original;
  if (relit.width !== width || relit.height !== height) throw new Error("transferLight: size mismatch");
  const alpha = channel(original, 3);
  const blurredAlpha = boxBlur(alpha, width, height, radius);
  const weightedBlur = (r: Raster, c: number) => {
    const plane = channel(r, c);
    for (let i = 0; i < plane.length; i++) plane[i] *= alpha[i];
    const b = boxBlur(plane, width, height, radius);
    for (let i = 0; i < b.length; i++) b[i] /= blurredAlpha[i] || 1;
    return b;
  };

  const data = new Uint8ClampedArray(original.data.length);
  for (let c = 0; c < 3; c++) {
    const lo = weightedBlur(original, c);
    const lr = weightedBlur(relit, c);
    for (let i = 0; i < lo.length; i++) {
      data[i * 4 + c] = original.data[i * 4 + c] * ((lr[i] + EPS) / (lo[i] + EPS));
    }
  }
  for (let i = 3; i < data.length; i += 4) data[i] = original.data[i];
  return { width, height, data };
}
