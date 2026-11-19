import { get, put } from "@vercel/blob";
import sharp from "sharp";
import { sql } from "@/lib/db";
import { UserError } from "./access";
export async function readImage(pathname: string) {
  const result = await get(pathname, { access: "private", useCache: false });
  if (!result) throw new UserError("Image not found.", 404);
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}
export async function saveImage(
  projectId: string,
  userId: string,
  data: Buffer,
) {
  const blob = await put(
    `${userId}/${projectId}/${crypto.randomUUID()}.png`,
    data,
    { access: "private", contentType: "image/png", addRandomSuffix: false },
  );
  await sql`INSERT INTO assets(pathname,project_id) VALUES(${blob.pathname},${projectId})`;
  return blob.pathname;
}
export async function decode(data: Buffer) {
  const { data: pixels, info } = await sharp(data, {
    limitInputPixels: 2048 * 2048,
  })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(pixels),
  };
}
export async function png(raster: {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}) {
  return sharp(Buffer.from(raster.data), {
    raw: { width: raster.width, height: raster.height, channels: 4 },
  })
    .png()
    .toBuffer();
}
