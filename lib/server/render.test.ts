import { expect, it, vi } from "vitest";
import sharp from "sharp";
const { files } = vi.hoisted(() => ({ files: new Map<string, Buffer>() }));
vi.mock("./assets", async () => {
  const s = (await import("sharp")).default;
  return {
    readImage: async (path: string) => {
      const b = files.get(path);
      if (!b) throw new Error("missing");
      return b;
    },
    decode: async (data: Buffer) => {
      const r = await s(data)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return {
        width: r.info.width,
        height: r.info.height,
        data: new Uint8ClampedArray(r.data),
      };
    },
    png: async (r: {
      width: number;
      height: number;
      data: Uint8ClampedArray;
    }) =>
      s(Buffer.from(r.data), {
        raw: { width: r.width, height: r.height, channels: 4 },
      })
        .png()
        .toBuffer(),
  };
});
import { render } from "./render";
import type { Layers } from "../engine/engine";
it("composites exact opaque subject pixels over a generated scene and exports cropped rotated text", async () => {
  files.set(
    "background",
    await sharp({
      create: { width: 100, height: 80, channels: 4, background: "#aabbcc" },
    })
      .png()
      .toBuffer(),
  );
  const data = Buffer.alloc(100 * 80 * 4);
  for (let y = 20; y < 60; y++)
    for (let x = 30; x < 70; x++) {
      const i = (y * 100 + x) * 4;
      data[i] = x;
      data[i + 1] = y;
      data[i + 2] = (x * y) % 255;
      data[i + 3] = 255;
    }
  files.set(
    "subject",
    await sharp(data, { raw: { width: 100, height: 80, channels: 4 } })
      .png()
      .toBuffer(),
  );
  const layers: Layers = {
    background: "background",
    subject: {
      original: "subject",
      image: "subject",
      matte: "mask",
      x: 0.5,
      y: 0.5,
      scale: 1,
      flipped: false,
    },
    texts: [],
    shadow: null,
    adjust: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, grain: 0 },
  };
  const output = await sharp(await render(layers))
    .ensureAlpha()
    .raw()
    .toBuffer();
  for (let y = 20; y < 60; y++)
    for (let x = 30; x < 70; x++) {
      const i = (y * 100 + x) * 4;
      expect(output.subarray(i, i + 4)).toEqual(data.subarray(i, i + 4));
    }
  const cropped = await render({
    ...layers,
    rotation: 90,
    crop: "portrait",
    texts: [
      {
        id: "t",
        text: "<Sale & save>",
        x: 0.5,
        y: 0.05,
        size: 0.1,
        color: "#ffffff",
      },
    ],
  });
  const meta = await sharp(cropped).metadata();
  expect(meta.width! / meta.height!).toBe(0.8);
}, 15000);

it("exports a valid exact 4:5 PNG from odd landscape dimensions", async () => {
  const image = await sharp({
    create: { width: 2048, height: 1367, channels: 4, background: "#aabbcc" },
  })
    .png()
    .toBuffer();
  files.set("odd-background", image);
  files.set(
    "odd-subject",
    await sharp({
      create: {
        width: 2048,
        height: 1367,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    })
      .png()
      .toBuffer(),
  );
  const output = await render({
    background: "odd-background",
    subject: {
      original: "odd-subject",
      image: "odd-subject",
      matte: "m",
      x: 0.5,
      y: 0.5,
      scale: 1,
      flipped: false,
    },
    shadow: null,
    texts: [],
    adjust: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, grain: 0 },
    crop: "portrait",
  });
  const meta = await sharp(output).metadata();
  expect(meta.width! / meta.height!).toBe(0.8);
  expect(meta.width).toBeLessThanOrEqual(2048);
  expect(meta.height).toBeLessThanOrEqual(1367);
});

it.each([
  [1, 2048],
  [2048, 1],
])("exports exact 4:5 even for a %i×%i upload", async (width, height) => {
  const image = await sharp({
    create: { width, height, channels: 4, background: "#aabbcc" },
  })
    .png()
    .toBuffer();
  files.set("narrow", image);
  const output = await render({
    background: "narrow",
    subject: {
      original: "narrow",
      image: "narrow",
      matte: "m",
      x: 0.5,
      y: 0.5,
      scale: 1,
      flipped: false,
    },
    texts: [],
    shadow: null,
    adjust: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, grain: 0 },
    crop: "portrait",
  });
  const meta = await sharp(output).metadata();
  expect(meta.width! / meta.height!).toBe(0.8);
});
