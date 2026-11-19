import { boxBlur, type Raster } from "./raster";
import { subjectBounds } from "./pixels";
type Region = { x: number; y: number; w: number; h: number };
/** Product, nearby contact shadow and selected overlays are the only editable regions. */
export function cleanupMask(
  subject: Raster,
  overlays: Region[],
  signs: Region[],
) {
  const { width, height } = subject,
    plane = new Float32Array(width * height);
  for (let i = 0; i < plane.length; i++)
    plane[i] = subject.data[i * 4 + 3] > 8 ? 255 : 0;
  const blurred = boxBlur(
    plane,
    width,
    height,
    Math.max(1, Math.round(Math.min(width, height) * 0.005)),
  );
  const mask = Uint8ClampedArray.from(blurred, (v) => (v > 0.1 ? 255 : 0));
  const fill = (r: Region, value: number) => {
    for (
      let y = Math.max(0, Math.floor(r.y * height));
      y < Math.min(height, Math.ceil((r.y + r.h) * height));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(r.x * width));
        x < Math.min(width, Math.ceil((r.x + r.w) * width));
        x++
      )
        mask[y * width + x] = value;
  };
  const bounds = subjectBounds(subject);
  // shortcut: contact-shadow cleanup uses a bounded band; longer cast shadows need the remove brush.
  if (bounds)
    fill(
      {
        x: (bounds.left - bounds.width * 0.35) / width,
        y: (bounds.top + bounds.height * 0.85) / height,
        w: (bounds.width * 1.7) / width,
        h: (bounds.height * 0.3) / height,
      },
      255,
    );
  overlays.forEach((r) => fill(r, 255));
  signs.forEach((r) => fill(r, 0));
  return mask;
}
