import { ownsBlobPath } from "@/lib/blob-path";
import { z } from "zod";
import {
  owner,
  lock,
  unlock,
  errorResponse,
  UserError,
} from "@/lib/server/access";
import { latest, versionStore } from "@/lib/server/versions";
import { readImage } from "@/lib/server/assets";
import { removeMasked } from "@/lib/server/providers";
export const maxDuration = 300;
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/projects/[id]/remove">,
) {
  let held: { userId: string; token: string } | undefined;
  try {
    const { id } = await params;
    const { userId } = await owner(id);
    const { token } = await lock(userId);
    held = { userId, token };
    const { fromVersion, maskPath } = z
      .object({ fromVersion: z.number().int().min(0), maskPath: z.string() })
      .parse(await request.json());
    if (!ownsBlobPath(maskPath, `${userId}/${id}`))
      throw new UserError("Invalid mask.");
    const base = await latest(id, fromVersion);
    if (!base) throw new UserError("Version not found.", 404);
    const layers = await removeMasked(
      base.layers,
      await readImage(maskPath),
      id,
      userId,
    );
    return Response.json({
      version: await versionStore(userId, token, false).append(
        id,
        layers,
        "Remove brush",
      ),
    });
  } catch (e) {
    return errorResponse(e);
  } finally {
    if (held) await unlock(held.userId, held.token);
  }
}
