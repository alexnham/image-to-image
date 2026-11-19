import { boxBlur, channel, type Raster } from "./raster";

const EPS = 1;
const MAX_BRIGHTNESS_GAIN = 1.35;
const linear = Float32Array.from({ length: 256 }, (_, value) => {
  const srgb = value / 255;
  return 255 * (srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4);
});

function encodeSrgb(value: number) {
  const unit = value / 255;
  return 255 * (unit <= 0.0031308 ? unit * 12.92 : 1.055 * unit ** (1 / 2.4) - 0.055);
}

function linearLuminance({ width, height, data }: Raster) {
  const plane = new Float32Array(width * height);
  for (let i = 0; i < plane.length; i++) {
    const offset = i * 4;
    plane[i] = 0.2126 * linear[data[offset]]
      + 0.7152 * linear[data[offset + 1]]
      + 0.0722 * linear[data[offset + 2]];
  }
  return plane;
}

function matteBlur(original: Raster, radius: number) {
  const { width, height } = original;
  const alpha = channel(original, 3);
  const coverage = boxBlur(alpha, width, height, radius);

  function blur(plane: Float32Array) {
    for (let i = 0; i < plane.length; i++) plane[i] *= alpha[i];
    const blurred = boxBlur(plane, width, height, radius);
    for (let i = 0; i < blurred.length; i++) blurred[i] /= coverage[i] || 1;
    return blurred;
  }

  return { blur, coverage };
}

/**
 * Moves only the low-frequency light change from `relit` onto `original`, so fine detail
 * (texture, labels, edges) still comes from the original pixels: out = original × blur(relit) / blur(original).
 * Blurs are weighted by the original's alpha so transparent pixels around the subject don't bleed in.
 */
export function transferLight(original: Raster, relit: Raster, radius = 16): Raster {
  const { width, height } = original;
  if (relit.width !== width || relit.height !== height) throw new Error("transferLight: size mismatch");
  const { blur } = matteBlur(original, radius);

  const data = new Uint8ClampedArray(original.data.length);
  for (let c = 0; c < 3; c++) {
    const lo = blur(channel(original, c));
    const lr = blur(channel(relit, c));
    for (let i = 0; i < lo.length; i++) {
      data[i * 4 + c] = original.data[i * 4 + c] * ((lr[i] + EPS) / (lo[i] + EPS));
    }
  }
  for (let i = 3; i < data.length; i += 4) data[i] = original.data[i];
  return { width, height, data };
}

/** Applies a bounded luminance gain in linear light while retaining the original colors and matte. */
export function transferBrightness(original: Raster, relit: Raster, radius = 16): Raster {
  const { width, height } = original;
  if (relit.width !== width || relit.height !== height) throw new Error("transferBrightness: size mismatch");
  const { blur, coverage } = matteBlur(original, radius);
  const sourceLight = blur(linearLuminance(original));
  const targetLight = blur(linearLuminance(relit));
  const data = original.data.slice();

  for (let i = 0; i < sourceLight.length; i++) {
    const offset = i * 4;
    if (data[offset + 3] === 0) continue;
    const ratio = (targetLight[i] + EPS) / (sourceLight[i] + EPS);
    const limited = Math.min(MAX_BRIGHTNESS_GAIN, Math.max(1 / MAX_BRIGHTNESS_GAIN, ratio));
    // A blurred matte tapers the gain where misalignment can introduce background shading.
    const softened = 1 + (limited - 1) * coverage[i] / 255;
    const red = linear[data[offset]];
    const green = linear[data[offset + 1]];
    const blue = linear[data[offset + 2]];
    const gain = Math.min(softened, 255 / Math.max(red, green, blue, 1));
    data[offset] = encodeSrgb(red * gain);
    data[offset + 1] = encodeSrgb(green * gain);
    data[offset + 2] = encodeSrgb(blue * gain);
  }

  return { width, height, data };
}
