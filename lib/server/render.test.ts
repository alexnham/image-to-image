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
