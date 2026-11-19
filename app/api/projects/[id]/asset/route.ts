import { owner, errorResponse, UserError } from "@/lib/server/access";
import { readImage } from "@/lib/server/assets";
import { sql } from "@/lib/db";
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/projects/[id]/asset">,
) {
  try {
    const { id } = await params;
    const { project } = await owner(id);
    const path = new URL(request.url).searchParams.get("path");
    const [asset] =
      await sql`SELECT pathname FROM assets WHERE project_id=${id} AND pathname=${path}`;
    if (!asset && path !== project.image_pathname)
      throw new UserError("Image not found.", 404);
    return new Response(new Uint8Array(await readImage(path!)), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
