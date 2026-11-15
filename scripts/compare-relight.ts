import sharp from "sharp";
import type { Raster } from "../lib/raster";
import { transferLight } from "../lib/relight";

const background = "#ffffff";

async function decode(path: string): Promise<Raster> {
  const { data, info } = await sharp(path).autoOrient().toColourspace("srgb").ensureAlpha()
    .raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

function render(image: Raster) {
  const { width, height, data } = image;
  return sharp(Buffer.from(data), { raw: { width, height, channels: 4 } })
    .flatten({ background }).png().toBuffer();
}

async function main() {
  const [originalPath, relitPath, outputPath, radiusArg] = process.argv.slice(2);
  const radius = radiusArg === undefined ? 16 : Number(radiusArg);
  if (!originalPath || !relitPath || !outputPath || !Number.isSafeInteger(radius) || radius < 1) {
    throw new Error("Usage: compare-relight <original with alpha> <aligned model output> <comparison.png> [blur radius]");
  }

  const [original, relit] = await Promise.all([decode(originalPath), decode(relitPath)]);
  const transferred = transferLight(original, relit, radius);
  const { width, height } = original;
  const gutter = 8;
  const panels = await Promise.all([render(original), render(relit), render(transferred)]);
  await sharp({
    create: { width: width * 3 + gutter * 2, height, channels: 3, background: "#e5e5e5" },
  }).composite(panels.map((input, index) => ({ input, top: 0, left: index * (width + gutter) })))
    .png().toFile(outputPath);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
