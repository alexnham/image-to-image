import { describe, expect, it } from "vitest";
import type { Raster } from "./raster";
import { contactShadow } from "./shadow";

const W = 100;
const H = 100;

// A box-shaped subject occupying x 30–69, y 20–79.
function boxMatte(): Raster {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 20; y < 80; y++) for (let x = 30; x < 70; x++) data[(y * W + x) * 4 + 3] = 255;
  return { width: W, height: H, data };
}

const rowSum = (s: Uint8ClampedArray, y: number) => s.slice(y * W, (y + 1) * W).reduce((a, b) => a + b, 0);

describe("contactShadow", () => {
  it("is empty for an empty matte", () => {
    const s = contactShadow({ width: W, height: H, data: new Uint8ClampedArray(W * H * 4) });
    expect(s.every((v) => v === 0)).toBe(true);
  });

  it("sits at the subject's base, not up its body", () => {
    const s = contactShadow(boxMatte(), { squash: 0.1, softness: 0.03 });
    // Flattened height ≈ 6px above the base (row 79), plus ~3px blur on each side of it.
    expect(rowSum(s, 77)).toBeGreaterThan(0);
    expect(rowSum(s, 40)).toBe(0);
    expect(rowSum(s, 79)).toBeGreaterThan(rowSum(s, 65));
  });

  it("stays within the requested darkness", () => {
    const s = contactShadow(boxMatte(), { opacity: 0.5 });
    expect(Math.max(...s)).toBeLessThanOrEqual(128);
    expect(Math.max(...s)).toBeGreaterThan(64);
  });

  it("spreads sideways beyond the subject's footprint", () => {
    const s = contactShadow(boxMatte());
    expect(s[79 * W + 28]).toBeGreaterThan(0);
  });
});
