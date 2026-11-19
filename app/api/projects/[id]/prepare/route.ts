import { cleanupMask } from "@/lib/cleanup-mask";
import { ownsBlobPath } from "@/lib/blob-path";
import type { TextLayer } from "@/lib/engine/engine";
import { detectText } from "@/lib/server/planner";
import sharp from "sharp";
import { z } from "zod";
import {
  owner,
  lock,
  unlock,
  errorResponse,
  UserError,
} from "@/lib/server/access";
import { readImage, decode, png, saveImage } from "@/lib/server/assets";
import { versionStore, latest } from "@/lib/server/versions";
import { extractSubject, overlapsMask, mergeRegion } from "@/lib/pixels";
import { editImage, providers } from "@/lib/server/providers";
import { EMPTY_ADJUST } from "@/lib/editor-schema";
import { sql } from "@/lib/db";
export const maxDuration = 300;
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/projects/[id]/prepare">,
) {
  let held: { userId: string; token: string } | undefined;
  try {
    const { id } = await params;
    const { userId, project } = await owner(id);
    const { token } = await lock(userId);
    held = { userId, token };
    if (await latest(id))
      throw new UserError("This project is already prepared.");
    const { maskPath } = z
      .object({ maskPath: z.string() })
      .parse(await request.json());
    if (!ownsBlobPath(maskPath, `${userId}/${id}`))
      throw new UserError("Invalid mask.");
    const source = await readImage(project.image_pathname),
      original = await decode(source);
    const maskImage = await readImage(maskPath);
    const raw = await sharp(maskImage, { limitInputPixels: 2048 * 2048 })
      .resize(original.width, original.height)
      .removeAlpha()
      .greyscale()
      .raw()
      .toBuffer();
    const mask = new Uint8ClampedArray(raw);
    if (
      !mask.some((v) => v > 128) ||
      mask.filter((v) => v > 128).length > mask.length * 0.98
    )
      throw new UserError(
        "Select the product and leave some background visible.",
      );
    await sql`INSERT INTO assets(pathname,project_id) VALUES(${maskPath},${id}) ON CONFLICT DO NOTHING`;
    const cutout = await saveImage(
      id,
      userId,
      await png(extractSubject(original, mask)),
    );
    const detected = await detectText(source);
    const overlays = detected.filter(
      (b) =>
        b.overlay && !overlapsMask(b, mask, original.width, original.height),
    );
    const signs = detected.filter(
      (b) =>
        !b.overlay && !overlapsMask(b, mask, original.width, original.height),
    );
    const editable = cleanupMask(
      extractSubject(original, mask),
      overlays,
      signs,
    );
    const edited = await decode(
      await editImage(
        await png(original),
        editable,
        "Remove the selected product, nearby contact shadow, and masked graphic headlines/prices. Reconstruct only these regions naturally. Keep all surrounding scene details and physical signs unchanged.",
      ),
    );
    const background = await saveImage(
      id,
      userId,
      await png(mergeRegion(original, edited, editable)),
    );
    let layers = {
      background,
      subject: {
        original: cutout,
        image: cutout,
        matte: maskPath,
        x: 0.5,
        y: 0.5,
        scale: 1,
        flipped: false,
      },
      shadow: null as string | null,
      texts: overlays.map((b) => ({
        id: crypto.randomUUID(),
        text: b.text,
        x: Math.min(1, b.x + b.w / 2),
        y: b.y,
        size: Math.max(
          0.01,
          Math.min(0.5, ((b.h * original.height) / original.width) * 0.8),
        ),
        color: b.color,
      })) as TextLayer[],
      adjust: EMPTY_ADJUST,
    };
    layers = {
      ...layers,
      shadow: await providers(id, userId).renderShadow(layers),
    };
    const version = await versionStore(userId, token, false).append(
      id,
      layers,
      "Product confirmed",
    );
    return Response.json({ version });
  } catch (e) {
    return errorResponse(e);
  } finally {
    if (held) await unlock(held.userId, held.token);
  }
}
