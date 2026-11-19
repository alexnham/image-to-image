import { owner, errorResponse, UserError } from "@/lib/server/access";
import { latest } from "@/lib/server/versions";
import { render } from "@/lib/server/render";
import { sql } from "@/lib/db";
export async function GET(
  request: Request,
  { params }: RouteContext<"/api/projects/[id]/export">,
) {
  try {
    const { id } = await params;
    const { userId } = await owner(id);
    const value = new URL(request.url).searchParams.get("version");
    const number = value === null ? undefined : Number(value);
    if (number !== undefined && (!Number.isInteger(number) || number < 0))
      throw new UserError("Invalid version.");
    const version = await latest(id, number);
    if (!version) throw new UserError("Version not found.", 404);
    const image = await render(version.layers);
    await sql`INSERT INTO events(user_id,name) VALUES(${userId},'export')`;
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="ad.png"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
