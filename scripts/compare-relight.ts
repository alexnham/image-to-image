import sharp from "sharp";
import type { Raster } from "../lib/raster";
import { transferBrightness, transferLight } from "../lib/relight";

async function decode(path: string): Promise<Raster> {
  const { data, info } = await sharp(path).autoOrient().toColourspace("srgb").ensureAlpha()
    .raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
}

async function render(image: Raster, backdrop?: Buffer) {
  const { width, height, data } = image;
  const subject = sharp(Buffer.from(data), { raw: { width, height, channels: 4 } });
  if (!backdrop) return subject.flatten({ background: "#ffffff" }).png().toBuffer();
  const layer = await subject.png().toBuffer();
  return sharp(backdrop).composite([{ input: layer }]).png().toBuffer();
}

async function main() {
  const [originalPath, relitPath, outputPath, radiusArg, backdropPath, selection] = process.argv.slice(2);
  const radius = radiusArg === undefined ? 16 : Number(radiusArg);
  const rejected = selection === "--reject-relight";
  if (!originalPath || !relitPath || !outputPath || !Number.isSafeInteger(radius) || radius < 1
    || (selection !== undefined && !rejected)) {
    throw new Error("Usage: compare-relight <original with alpha> <aligned model output> <comparison.png> [blur radius] [background image [--reject-relight]]");
  }

  const [original, relit] = await Promise.all([decode(originalPath), decode(relitPath)]);
  const transferred = transferLight(original, relit, radius);
  const { width, height } = original;
  const backdrop = backdropPath ? await sharp(backdropPath).autoOrient()
    .resize(width, height, { fit: "cover" }).png().toBuffer() : undefined;
  const images = backdrop
    ? [original, transferred, rejected ? original : transferBrightness(original, relit, radius)]
    : [original, relit, transferred];
  const gutter = 8;
  const panels = await Promise.all(images.map((image) => render(image, backdrop)));
  await sharp({
    create: { width: width * 3 + gutter * 2, height, channels: 3, background: "#e5e5e5" },
  }).composite(panels.map((input, index) => ({ input, top: 0, left: index * (width + gutter) })))
    .png().toFile(outputPath);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
