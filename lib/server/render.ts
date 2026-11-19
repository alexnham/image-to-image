import { frame } from "@/lib/frame";
import { FONT_FAMILIES, FONT_FILES } from "@/lib/fonts";
import path from "node:path";
import { adjustPixels } from "@/lib/pixels";
import sharp, { type OverlayOptions } from "sharp";
import type { Layers } from "@/lib/engine/engine";
import { readImage, decode, png } from "./assets";
export async function render(layers: Layers, text = true, finish = true) {
  const background = await readImage(layers.background);
  const meta = await sharp(background).metadata();
  const width = meta.width!,
    height = meta.height!;
  const overlays: OverlayOptions[] = [];
  async function add(path: string) {
    const scale = layers.subject.scale;
    const w = Math.max(1, Math.round(width * scale)),
      h = Math.max(1, Math.round(height * scale));
    const x = Math.round(layers.subject.x * width - w / 2),
      y = Math.round(layers.subject.y * height - h / 2);
    const left = Math.max(0, x),
      top = Math.max(0, y),
      right = Math.min(width, x + w),
      bottom = Math.min(height, y + h);
    if (right <= left || bottom <= top) return;
    const input = await sharp(await readImage(path))
      .resize(w, h)
      .flop(layers.subject.flipped)
      .extract({
        left: left - x,
        top: top - y,
        width: right - left,
        height: bottom - top,
      })
      .png()
      .toBuffer();
    overlays.push({ input, left, top });
  }
  if (layers.shadow) await add(layers.shadow);
  await add(layers.subject.image);
  let image = await sharp(background)
    .ensureAlpha()
    .composite(overlays)
    .png()
    .toBuffer();
  if (finish) {
    const raster = await decode(image);
    adjustPixels(raster.data, layers.adjust);
    image = await png(raster);
  }
  if (text && layers.texts.length) {
    // Register the exact bundled fonts in Pango so SVG export matches browser typography.
    for (const font of new Set(layers.texts.map((t) => t.font ?? "sans"))) {
      await sharp({
        text: {
          text: "A",
          font: `${FONT_FAMILIES[font]} 12`,
          fontfile: path.join(process.cwd(), "public/fonts", FONT_FILES[font]),
          rgba: true,
        },
      })
        .png()
        .toBuffer();
    }

    const esc = (s: string) =>
      s.replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&apos;",
          })[c]!,
      );
    const svg = `<svg width="${width}" height="${height}">${layers.texts.map((t) => `<text x="${t.x * width}" y="${t.y * height}" text-anchor="middle" dominant-baseline="hanging" font-family="${FONT_FAMILIES[t.font ?? "sans"]}" font-weight="700" font-size="${t.size * width}" fill="${t.color}">${esc(t.text)}</text>`).join("")}</svg>`;
    image = await sharp(image)
      .composite([{ input: Buffer.from(svg) }])
      .png()
      .toBuffer();
  }
  if (finish) {
    let output = sharp(image).rotate(layers.rotation ?? 0);
    if (layers.crop && layers.crop !== "original") {
      const {
        left,
        top,
        width: cropWidth,
        height: cropHeight,
        outputWidth,
        outputHeight,
      } = frame(width, height, layers);
      output = sharp(await output.png().toBuffer())
        .extract({
          left,
          top,
          width: cropWidth,
          height: cropHeight,
        })
        .resize(outputWidth, outputHeight, { fit: "fill" });
    }
    image = await output.png().toBuffer();
  }
  return image;
}
