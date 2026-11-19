import sharp from "sharp";
import { decode, png } from "./assets";
import { extractSubject, subjectBounds } from "../pixels";
import { UserError } from "../errors";
/** Fit actual product pixels, rather than the replacement photograph's framing. */
export async function fitSubject(
  previous: Buffer,
  photo: Buffer,
  maskImage: Buffer,
  width: number,
  height: number,
) {
  const original = await decode(photo);
  const mask = new Uint8ClampedArray(
    await sharp(maskImage, { limitInputPixels: 2048 * 2048 })
      .resize(original.width, original.height, { fit: "fill" })
      .removeAlpha()
      .greyscale()
      .raw()
      .toBuffer(),
  );
  const cutout = extractSubject(original, mask),
    source = subjectBounds(cutout),
    target = subjectBounds(await decode(previous));
  if (!source || !target)
    throw new UserError("Select your product before continuing.");
  const replacement = await sharp(await png(cutout))
    .extract(source)
    .resize(target.width, target.height, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const image = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: replacement, left: target.left, top: target.top }])
    .png()
    .toBuffer();
  return {
    image,
    matte: await sharp(image).extractChannel("alpha").png().toBuffer(),
  };
}
