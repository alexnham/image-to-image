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
import { readImage, saveImage } from "@/lib/server/assets";
import { fitSubject } from "@/lib/server/fit-subject";
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
    const fitted = await fitSubject(
      await readImage(base.layers.subject.original),
      await readImage(input.imagePath),
      await readImage(input.maskPath),
      meta.width!,
      meta.height!,
    );
    const cutout = await saveImage(id, userId, fitted.image);
    const matte = await saveImage(id, userId, fitted.matte);
    const layers = {
      ...base.layers,
      subject: {
        ...base.layers.subject,
        original: cutout,
        image: cutout,
        matte,
      },
    };
    const adapter = providers(id, userId);
    if (layers.subject.lighting)
      layers.subject.image = await adapter.relight(
        layers,
        layers.subject.lighting,
      );
    layers.shadow = await adapter.renderShadow(layers);
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
