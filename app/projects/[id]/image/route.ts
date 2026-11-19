import { owner, errorResponse } from "@/lib/server/access";
import { readImage } from "@/lib/server/assets";
export async function GET(
  _request: Request,
  { params }: RouteContext<"/projects/[id]/image">,
) {
  try {
    const { id } = await params;
    const { project } = await owner(id);
    return new Response(
      new Uint8Array(await readImage(project.image_pathname)),
      {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "private, no-store",
        },
      },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
