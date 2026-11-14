import { describe, expect, it } from "vitest";
import type { Raster } from "./raster";
import { transferLight } from "./relight";

const W = 48;
const H = 48;

function raster(fn: (x: number, y: number) => [number, number, number, number]): Raster {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data.set(fn(x, y), (y * W + x) * 4);
  return { width: W, height: H, data };
}

const px = (r: Raster, x: number, y: number) => Array.from(r.data.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
const checker = (x: number, y: number) => ((x + y) % 2 ? 200 : 100);

describe("transferLight", () => {
  it("returns the original when the light didn't change", () => {
    const original = raster((x, y) => [checker(x, y), 80, 40, 255]);
    const out = transferLight(original, original, 4);
    for (let i = 0; i < out.data.length; i++) expect(Math.abs(out.data[i] - original.data[i])).toBeLessThanOrEqual(1);
  });

  it("keeps the original's fine detail when the relight model blurred it away", () => {
    const original = raster((x, y) => [checker(x, y), checker(x, y), checker(x, y), 255]);
    // The model returned half the light and lost the checker pattern (mean 150 → flat 75).
    const relit = raster(() => [75, 75, 75, 255]);
    const out = transferLight(original, relit, 4);
    const [dark] = px(out, 20, 20); // checker 100
    const [light] = px(out, 21, 20); // checker 200
    expect(dark).toBeCloseTo(50, -1);
    expect(light).toBeCloseTo(100, -1);
  });

  it("carries a color shift such as warmer light", () => {
    const original = raster(() => [100, 100, 100, 255]);
    const relit = raster(() => [130, 100, 70, 255]);
    const [r, g, b] = px(transferLight(original, relit, 4), 24, 24);
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
  });

  it("keeps the original alpha and ignores transparent pixels around the subject", () => {
    // Opaque subject on the left half; the transparent right half holds junk colors.
    const original = raster((x) => (x < W / 2 ? [100, 100, 100, 255] : [255, 0, 0, 0]));
    const out = transferLight(original, original, 6);
    expect(px(out, 23, 24)).toEqual([100, 100, 100, 255]);
    expect(px(out, 30, 24)[3]).toBe(0);
  });

  it("rejects mismatched sizes", () => {
    const original = raster(() => [0, 0, 0, 255]);
    expect(() => transferLight(original, { ...original, width: 10 }, 4)).toThrow(/size/);
  });
});
