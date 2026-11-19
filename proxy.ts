import { NextResponse, type NextRequest } from "next/server";
export function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    let trustedOrigin = !origin;
    if (origin) {
      try {
        trustedOrigin = new URL(origin).host === request.headers.get("host");
      } catch {
        /* Reject opaque and malformed origins. */
      }
    }
    if (!trustedOrigin)
      return Response.json(
        { error: "Please make edits from this app." },
        { status: 403 },
      );
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return Response.json({ error: "Expected JSON." }, { status: 415 });
  }
  return NextResponse.next();
}
export const config = { matcher: "/api/projects/:path*" };
