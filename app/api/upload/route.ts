import { ownsBlobPath } from "@/lib/blob-path";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { MAX_UPLOAD_BYTES, STORED_TYPES } from "@/lib/image";

// Issues a short-lived token so the browser uploads straight to Blob
// (Vercel functions cap request bodies at 4.5MB).
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const userId = (await auth())?.user?.id;
        if (!userId) throw new Error("Not signed in");
        if (!ownsBlobPath(pathname, userId)) throw new Error("Invalid path");
        return {
          allowedContentTypes: STORED_TYPES,
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 },
    );
  }
}
