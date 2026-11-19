import { describe, it, expect } from "vitest";
import { extractSubject, mergeRegion } from "./pixels";
import type { Raster } from "./raster";
const original: Raster = {
  width: 3,
  height: 1,
  data: new Uint8ClampedArray([
    12, 34, 56, 255, 78, 90, 123, 255, 210, 220, 230, 255,
  ]),
};
describe("pixel preservation", () => {
  it("extracts a soft cutout without changing RGB detail", () => {
    const result = extractSubject(
      original,
      new Uint8ClampedArray([0, 128, 255]),
    );
    for (let i = 0; i < 3; i++)
      expect([...result.data.slice(i * 4, i * 4 + 3)]).toEqual([
        ...original.data.slice(i * 4, i * 4 + 3),
      ]);
    expect([...result.data.filter((_, i) => i % 4 === 3)]).toEqual([
      0, 128, 255,
    ]);
    expect(original.data[3]).toBe(255);
  });
  it("ignores provider drift outside a removal mask", () => {
    const edit = { ...original, data: new Uint8ClampedArray(12).fill(255) };
    const result = mergeRegion(
      original,
      edit,
      new Uint8ClampedArray([0, 255, 0]),
    );
    expect([...result.data.slice(0, 4)]).toEqual([
      ...original.data.slice(0, 4),
    ]);
    expect([...result.data.slice(8)]).toEqual([...original.data.slice(8)]);
    expect([...result.data.slice(4, 8)]).toEqual([255, 255, 255, 255]);
  });
  it("rejects incorrectly aligned output", () => {
    expect(() =>
      mergeRegion(
        original,
        { ...original, width: 2 },
        new Uint8ClampedArray(3),
      ),
    ).toThrow("size mismatch");
  });
});
