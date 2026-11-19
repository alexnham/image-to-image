import { del, list } from "@vercel/blob";
import { owner, lock, unlock, errorResponse } from "@/lib/server/access";
import { sql } from "@/lib/db";
export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/projects/[id]">,
) {
  let held: { userId: string; token: string } | undefined;
  try {
    const { id } = await params;
    const { userId, project } = await owner(id);
    const { token } = await lock(userId);
    held = { userId, token };
    // Files first, row last: a storage failure leaves a retryable record, not inaccessible private files.
    const rows = await sql`SELECT pathname FROM assets WHERE project_id=${id}`;
    const paths = new Set<string>([
      project.image_pathname,
      ...rows.map((r) => r.pathname),
    ]);
    let cursor: string | undefined;
    do {
      const page = await list({ prefix: `${userId}/${id}/`, cursor });
      page.blobs.forEach((b) => paths.add(b.pathname));
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    await del([...paths]);
    await sql`DELETE FROM projects WHERE id=${id}`;
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  } finally {
    if (held) await unlock(held.userId, held.token);
  }
}
