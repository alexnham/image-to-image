import sharp from "sharp";
import type { Layers, Providers } from "@/lib/engine/engine";
import { contactShadow } from "@/lib/shadow";
import { transferBrightness } from "@/lib/relight";
import { mergeRegion } from "@/lib/pixels";
import { readImage, decode, png, saveImage } from "./assets";
import { render } from "./render";
import { IMAGE_MODEL, openai } from "./openai";
import { UserError } from "./access";
export async function editImage(
  input: Buffer,
  mask: Uint8ClampedArray,
  prompt: string,
) {
  const { width, height } = await sharp(input).metadata();
  const rgba = new Uint8ClampedArray(width! * height! * 4);
  for (let i = 0; i < mask.length; i++) rgba[i * 4 + 3] = 255 - mask[i];
  const form = new FormData();
  form.set("model", IMAGE_MODEL);
  form.set("quality", "low");
  form.set("n", "1");
  form.set("output_format", "png");
  // Provider output is explicitly resampled back to the app canvas.
  form.set(
    "size",
    width === height
      ? "1024x1024"
      : width! > height!
        ? "1536x1024"
        : "1024x1536",
  );
  form.set(
    "image",
    new Blob([new Uint8Array(input)], { type: "image/png" }),
    "input.png",
  );
  form.set(
    "mask",
    new Blob(
      [
        new Uint8Array(
          await png({ width: width!, height: height!, data: rgba }),
        ),
      ],
      { type: "image/png" },
    ),
    "mask.png",
  );
  form.set("prompt", prompt.slice(0, 4000));
  const result = await openai("images/edits", form, true);
  const b64 = (result.data as { b64_json?: string }[])?.[0]?.b64_json;
  if (!b64)
    throw new UserError("No image was returned. Please try again.", 502);
  return sharp(Buffer.from(b64, "base64"))
    .resize(width!, height!, { fit: "fill" })
    .ensureAlpha()
    .png()
    .toBuffer();
}
export function providers(projectId: string, userId: string): Providers {
  const save = (data: Buffer) => saveImage(projectId, userId, data);
  return {
    async replaceBackground(layers, scene) {
      const input = await render(layers, false, false);
      const meta = await sharp(input).metadata();
      const mask = new Uint8ClampedArray(meta.width! * meta.height!).fill(255);
      // Request an empty scene, then put the untouched cutout on it locally.
      return save(
        await editImage(
          input,
          mask,
          `Create a believable photographic background for this product: ${scene}. Remove the product entirely from the image, reconstruct the surface behind it. Leave the scene empty for compositing the original product. No lettering, products, dramatic studio lighting, oversaturation or plastic smoothing. Keep camera angle and composition. The original product will be composited back in its current position, so the support surface must extend behind the product and fill the entire lower half of the frame through the bottom edge. No table edge, floor, chair, or drop-off beneath the product. Match the perspective of the reference product.`,
        ),
      );
    },
    async relight(layers, light) {
      const original = await decode(await readImage(layers.subject.original));
      const data = original.data.slice();
      for (let y = 0; y < original.height; y++)
        for (let x = 0; x < original.width; x++) {
          const pos =
            light.direction === "left"
              ? 1 - x / original.width
              : light.direction === "right"
                ? x / original.width
                : light.direction === "top"
                  ? 1 - y / original.height
                  : 0.5;
          const gain =
            1 +
            (pos - 0.5) * 0.4 * (1 - light.softness) +
            (light.direction === "back"
              ? -0.08
              : light.direction === "front"
                ? 0.08
                : 0);
          const i = (y * original.width + x) * 4;
          for (let c = 0; c < 3; c++)
            data[i + c] =
              original.data[i + c] *
              gain *
              (1 + (c === 0 ? 1 : c === 2 ? -1 : 0) * light.warmth * 0.12);
        }
      return save(
        await png(
          transferBrightness(
            original,
            { ...original, data },
            Math.max(2, Math.round(original.width / 64)),
          ),
        ),
      );
    },
    async renderShadow(layers) {
      const subject = await decode(await readImage(layers.subject.image));
      const alpha = contactShadow(subject);
      const data = new Uint8ClampedArray(subject.data.length);
      for (let i = 0; i < alpha.length; i++) data[i * 4 + 3] = alpha[i];
      return save(await png({ ...subject, data }));
    },
    async removeObject(image, region) {
      const input = await readImage(image),
        original = await decode(input);
      const mask = new Uint8ClampedArray(original.width * original.height);
      for (let y = 0; y < original.height; y++)
        for (let x = 0; x < original.width; x++)
          if (
            x >= region.x * original.width &&
            x < (region.x + region.w) * original.width &&
            y >= region.y * original.height &&
            y < (region.y + region.h) * original.height
          )
            mask[y * original.width + x] = 255;
      const edited = await decode(
        await editImage(
          input,
          mask,
          "Remove the unwanted object in the transparent masked region and reconstruct the surrounding scene naturally. Keep everything else exactly unchanged. No text.",
        ),
      );
      return save(await png(mergeRegion(original, edited, mask)));
    },
  };
}
export async function removeMasked(
  layers: Layers,
  maskPng: Buffer,
  projectId: string,
  userId: string,
) {
  const background = await readImage(layers.background),
    original = await decode(background);
  const raw = await sharp(maskPng, { limitInputPixels: 2048 * 2048 })
    .resize(original.width, original.height, { fit: "fill" })
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer();
  const mask = new Uint8ClampedArray(raw);
  const edited = await decode(
    await editImage(
      background,
      mask,
      "Erase only the marked object/text. Reconstruct the background naturally. Preserve the surrounding scene.",
    ),
  );
  return {
    ...layers,
    background: await saveImage(
      projectId,
      userId,
      await png(mergeRegion(original, edited, mask)),
    ),
  };
}
