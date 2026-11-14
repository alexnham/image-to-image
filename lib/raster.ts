/** RGBA pixels, same layout as the browser's ImageData, so it works on server and client. */
export type Raster = { width: number; height: number; data: Uint8ClampedArray };

export function channel(r: Raster, c: number): Float32Array {
  const out = new Float32Array(r.width * r.height);
  for (let i = 0; i < out.length; i++) out[i] = r.data[i * 4 + c];
  return out;
}

function blur1d(src: Float32Array, dst: Float32Array, lines: number, len: number, lineStride: number, step: number, r: number) {
  const size = 2 * r + 1;
  for (let l = 0; l < lines; l++) {
    const base = l * lineStride;
    const at = (i: number) => src[base + Math.min(len - 1, Math.max(0, i)) * step];
    let sum = 0;
    for (let i = -r; i <= r; i++) sum += at(i);
    for (let i = 0; i < len; i++) {
      dst[base + i * step] = sum / size;
      sum += at(i + r + 1) - at(i - r);
    }
  }
}

/** Approximate Gaussian blur of one plane: three separable box passes, edges clamped, O(pixels). */
export function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
  const r = Math.round(radius);
  if (r < 1) return src.slice();
  const a = src.slice();
  const b = new Float32Array(src.length);
  for (let pass = 0; pass < 3; pass++) {
    blur1d(a, b, height, width, width, 1, r);
    blur1d(b, a, width, height, 1, width, r);
  }
  return a;
}
