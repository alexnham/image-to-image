import { z } from "zod";
import {
  owner,
  lock,
  unlock,
  errorResponse,
  UserError,
} from "@/lib/server/access";
import { latest, versionStore } from "@/lib/server/versions";
import { ManualSchema } from "@/lib/editor-schema";
import { sql } from "@/lib/db";
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/projects/[id]/versions">,
) {
  try {
    const { id } = await params;
    const { userId } = await owner(id);
    const versions =
      await sql`SELECT number,layers,prompt,created_at FROM versions WHERE project_id=${id} ORDER BY number DESC`;
    const [account] =
      await sql`SELECT prompts_used FROM accounts WHERE user_id=${userId}`;
    return Response.json({
      versions: versions.map((v) => ({ ...v, projectId: id })),
      remaining: 20 - Number(account?.prompts_used ?? 0),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(
  request: Request,
  { params }: RouteContext<"/api/projects/[id]/versions">,
) {
  let held: { userId: string; token: string } | undefined;
  try {
    const { id } = await params;
    const { userId } = await owner(id);
    const { token } = await lock(userId);
    held = { userId, token };
    const { fromVersion, manual } = z
      .object({ fromVersion: z.number().int().min(0), manual: ManualSchema })
      .parse(await request.json());
    const base = await latest(id, fromVersion);
    if (!base) throw new UserError("Version not found.", 404);
    const layers = {
      ...base.layers,
      texts: manual.texts,
      subject: { ...base.layers.subject, ...manual.transform },
      adjust: manual.adjust,
      crop: manual.crop,
      rotation: manual.rotation,
    };
    return Response.json({
      version: await versionStore(userId, token, false).append(
        id,
        layers,
        "Manual edits",
      ),
    });
  } catch (e) {
    return errorResponse(e);
  } finally {
    if (held) await unlock(held.userId, held.token);
  }
}
