import { get } from "@vercel/blob";
import { auth } from "@/auth";
import { sql } from "@/lib/db";

// Streams a private project image to its owner only.
export async function GET(_request: Request, { params }: RouteContext<"/projects/[id]/image">) {
  const userId = (await auth())?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const { id } = await params;
  const [project] = await sql`
    SELECT image_pathname FROM projects WHERE id = ${id} AND user_id = ${userId}`;
  if (!project) return new Response("Not found", { status: 404 });
  const result = await get(project.image_pathname, { access: "private" });
  if (!result) return new Response("Not found", { status: 404 });
  return new Response(result.stream, {
    headers: { "Content-Type": result.blob.contentType ?? "application/octet-stream", "Cache-Control": "private, max-age=3600" },
  });
}
