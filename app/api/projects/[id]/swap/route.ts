import { ownsBlobPath } from "@/lib/blob-path";
import { z } from "zod";
import sharp from "sharp";
import {
  owner,
  lock,
  unlock,
  errorResponse,
  UserError,
} from "@/lib/server/access";
import { latest, versionStore } from "@/lib/server/versions";
import { readImage, decode, png, saveImage } from "@/lib/server/assets";
import { extractSubject } from "@/lib/pixels";
import { providers } from "@/lib/server/providers";
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/projects/[id]/swap">,
) {
  let held: { userId: string; token: string } | undefined;
  try {
    const { id } = await params;
    const { userId } = await owner(id);
    const { token } = await lock(userId);
    held = { userId, token };
    const input = z
      .object({
        fromVersion: z.number().int().min(0),
        imagePath: z.string(),
        maskPath: z.string(),
      })
      .parse(await request.json());
    if (
      ![input.imagePath, input.maskPath].every((p) =>
        ownsBlobPath(p, `${userId}/${id}`),
      )
    )
      throw new UserError("Invalid image.");
    const base = await latest(id, input.fromVersion);
    if (!base) throw new UserError("Version not found.", 404);
    const meta = await sharp(
      await readImage(base.layers.background),
    ).metadata();
    const image = await decode(
      await sharp(await readImage(input.imagePath), {
        limitInputPixels: 2048 * 2048,
      })
        .resize(meta.width, meta.height, {
          fit: "contain",
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer(),
    );
    const mask = new Uint8ClampedArray(
      await sharp(await readImage(input.maskPath), {
        limitInputPixels: 2048 * 2048,
      })
        .resize(meta.width, meta.height, {
          fit: "contain",
          background: "black",
        })
        .removeAlpha()
        .greyscale()
        .raw()
        .toBuffer(),
    );
    if (!mask.some((value) => value > 128))
      throw new UserError("Select your product before continuing.");
    const cutout = await saveImage(
      id,
      userId,
      await png(extractSubject(image, mask)),
    );
    const matte = await saveImage(
      id,
      userId,
      await sharp(Buffer.from(mask), {
        raw: { width: image.width, height: image.height, channels: 1 },
      })
        .png()
        .toBuffer(),
    );
    const layers = {
      ...base.layers,
      subject: {
        ...base.layers.subject,
        original: cutout,
        image: cutout,
        matte,
      },
    };
    layers.shadow = await providers(id, userId).renderShadow(layers);
    return Response.json({
      version: await versionStore(userId, token, false).append(
        id,
        layers,
        "Swap product photo",
      ),
    });
  } catch (e) {
    return errorResponse(e);
  } finally {
    if (held) await unlock(held.userId, held.token);
  }
}
