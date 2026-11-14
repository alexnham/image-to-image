import { describe, expect, it } from "vitest";
import { fitWithin, validateFile } from "./image";

const MB = 1024 * 1024;

describe("validateFile", () => {
  it("accepts JPEG, PNG and WebP", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validateFile({ type, name: "a", size: MB })).toBeNull();
    }
  });

  it("accepts HEIC by type or by extension when the browser gives no type", () => {
    expect(validateFile({ type: "image/heic", name: "a", size: MB })).toBeNull();
    expect(validateFile({ type: "", name: "IMG_0001.HEIC", size: MB })).toBeNull();
  });

  it("rejects other types", () => {
    expect(validateFile({ type: "image/gif", name: "a.gif", size: MB })).toMatch(/JPEG/);
    expect(validateFile({ type: "application/pdf", name: "a.pdf", size: MB })).toMatch(/JPEG/);
  });

  it("rejects files over 20MB", () => {
    expect(validateFile({ type: "image/jpeg", name: "a", size: 20 * MB })).toBeNull();
    expect(validateFile({ type: "image/jpeg", name: "a", size: 20 * MB + 1 })).toMatch(/20MB/);
  });
});

describe("fitWithin", () => {
  it("scales the long edge down to 2048", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: 2048 });
  });

  it("never upscales", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  it("keeps both dimensions nonzero for very narrow images", () => {
    expect(fitWithin(5000, 1)).toEqual({ width: 2048, height: 1 });
    expect(fitWithin(1, 5000)).toEqual({ width: 1, height: 2048 });
  });
});
