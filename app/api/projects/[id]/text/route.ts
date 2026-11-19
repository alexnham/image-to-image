import { overlapsMask } from "@/lib/pixels";
import { readImage, decode } from "@/lib/server/assets";
import { z } from "zod";
import {
  owner,
  lock,
  unlock,
  errorResponse,
  UserError,
} from "@/lib/server/access";
import { latest, versionStore } from "@/lib/server/versions";
import { detectText, DetectedText } from "@/lib/server/planner";
import { render } from "@/lib/server/render";
import { removeMasked } from "@/lib/server/providers";
import sharp from "sharp";
export const maxDuration = 300;
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/projects/[id]/text">,
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
        boxes: z.array(DetectedText).max(20).optional(),
      })
      .parse(await request.json());
    const base = await latest(id, input.fromVersion);
    if (!base) throw new UserError("Version not found.", 404);
    const image = await render(base.layers, false, false);
    if (!input.boxes) return Response.json({ boxes: await detectText(image) });
    const boxes = input.boxes.filter((b) => b.overlay);
    const subject = await decode(await readImage(base.layers.subject.image));
    const alpha = new Uint8ClampedArray(subject.width * subject.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = subject.data[i * 4 + 3];
    if (
      boxes.some((b) => overlapsMask(b, alpha, subject.width, subject.height))
    )
      throw new UserError(
        "That text overlaps protected product pixels. Swap in a real product photo before lifting it.",
      );
    if (!boxes.length) throw new UserError("Select at least one text overlay.");
    const { width, height } = await sharp(image).metadata();
    const mask = Buffer.alloc(width! * height!);
    for (const b of boxes)
      for (
        let y = Math.max(0, Math.floor(b.y * height!) - 3);
        y < Math.min(height!, Math.ceil((b.y + b.h) * height!) + 3);
        y++
      )
        for (
          let x = Math.max(0, Math.floor(b.x * width!) - 3);
          x < Math.min(width!, Math.ceil((b.x + b.w) * width!) + 3);
          x++
        )
          mask[y * width! + x] = 255;
    const maskPng = await sharp(mask, {
      raw: { width: width!, height: height!, channels: 1 },
    })
      .png()
      .toBuffer();
    const layers = await removeMasked(base.layers, maskPng, id, userId);
    layers.texts = [
      ...layers.texts,
      ...boxes.map((b) => ({
        id: crypto.randomUUID(),
        text: b.text,
        x: Math.min(1, b.x + b.w / 2),
        y: b.y,
        size: Math.max(0.01, Math.min(0.5, ((b.h * height!) / width!) * 0.8)),
        color: b.color,
      })),
    ];
    return Response.json({
      version: await versionStore(userId, token, false).append(
        id,
        layers,
        "Lift text overlays",
      ),
    });
  } catch (e) {
    return errorResponse(e);
  } finally {
    if (held) await unlock(held.userId, held.token);
  }
}
