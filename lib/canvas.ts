import { frame } from "./frame";
import { FONT_FAMILIES } from "./fonts";
import { adjustPixels } from "./pixels";
import type { Layers } from "./engine/engine";
const images = new Map<string, Promise<HTMLImageElement>>();
export function loadImage(src: string) {
  let found = images.get(src);
  if (!found) {
    found = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => {
        images.delete(src);
        reject(new Error("Couldn't load a project image."));
      };
      image.src = src;
    });
    images.set(src, found);
  }
  return found;
}
export async function drawLayers(
  canvas: HTMLCanvasElement,
  layers: Layers,
  asset: (path: string) => string,
) {
  const [background, subject, shadow] = await Promise.all([
    loadImage(asset(layers.background)),
    loadImage(asset(layers.subject.image)),
    layers.shadow ? loadImage(asset(layers.shadow)) : null,
  ]);
  await Promise.all(
    layers.texts.map((t) =>
      document.fonts.load(`700 16px "${FONT_FAMILIES[t.font ?? "sans"]}"`),
    ),
  );
  const width = background.naturalWidth,
    height = background.naturalHeight;
  const base = document.createElement("canvas");
  base.width = width;
  base.height = height;
  const ctx = base.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(background, 0, 0);
  ctx.save();
  ctx.translate(layers.subject.x * width, layers.subject.y * height);
  ctx.scale(layers.subject.flipped ? -1 : 1, 1);
  const w = width * layers.subject.scale,
    h = height * layers.subject.scale;
  if (shadow) ctx.drawImage(shadow, -w / 2, -h / 2, w, h);
  ctx.drawImage(subject, -w / 2, -h / 2, w, h);
  ctx.restore();
  const pixels = ctx.getImageData(0, 0, width, height),
    data = pixels.data;
  adjustPixels(data, layers.adjust);
  ctx.putImageData(pixels, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const t of layers.texts) {
    ctx.font = `700 ${t.size * width}px "${FONT_FAMILIES[t.font ?? "sans"]}"`;
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x * width, t.y * height);
  }
  const rotation = layers.rotation ?? 0,
    rotated = document.createElement("canvas");
  rotated.width = rotation % 180 ? height : width;
  rotated.height = rotation % 180 ? width : height;
  const rc = rotated.getContext("2d")!;
  rc.translate(rotated.width / 2, rotated.height / 2);
  rc.rotate((rotation * Math.PI) / 180);
  rc.drawImage(base, -width / 2, -height / 2);
  const {
    left,
    top,
    width: cropWidth,
    height: cropHeight,
    outputWidth,
    outputHeight,
  } = frame(width, height, layers);
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  canvas
    .getContext("2d")!
    .drawImage(
      rotated,
      left,
      top,
      cropWidth,
      cropHeight,
      0,
      0,
      outputWidth,
      outputHeight,
    );
}
