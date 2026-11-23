import sharp from "sharp";
import { owner, errorResponse, UserError } from "@/lib/server/access";
import { latest } from "@/lib/server/versions";
import { render } from "@/lib/server/render";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await owner(id);
    const value = new URL(request.url).searchParams.get("version");
    if (value === null || !/^(0|[1-9]\d*)$/.test(value) || !Number.isSafeInteger(Number(value)))
      throw new UserError("Invalid version.");
    const version = await latest(id, Number(value));
    if (!version) throw new UserError("Version not found.", 404);
    // Reuse the export compositor: text, transforms, crop and rotation must match.
    // This is a preview only; it neither calls AI nor records an export event.
    const image = await sharp(await render(version.layers))
      .resize({ width: 160, height: 160, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer();
    return new Response(new Uint8Array(image), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
