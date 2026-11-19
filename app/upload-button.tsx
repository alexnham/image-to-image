"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState } from "react";
import { createProject } from "@/app/actions";
import { prepareImage, validateFile } from "@/lib/image";

export function UploadButton({ userId }: { userId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const busy = status === "Preparing…" || status === "Uploading…";

  async function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const error = validateFile(file);
    if (error) return setStatus(error);
    try {
      setStatus("Preparing…");
      const image = await prepareImage(file);
      setStatus("Uploading…");
      const ext = image.type === "image/png" ? "png" : "jpg";
      const blob = await upload(`${userId}/upload.${ext}`, image, {
        access: "private",
        handleUploadUrl: "/api/upload",
      });
      await createProject(blob.pathname);
    } catch (e) {
      // redirect() from the server action surfaces as a thrown navigation; let it through.
      if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT"))
        throw e;
      setStatus("Upload failed. Please try again.");
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        className="primary"
        disabled={busy}
        onClick={() => input.current?.click()}
      >
        {busy ? status : "Upload a photo"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        className="sr-only"
        onChange={onChange}
        disabled={busy}
      />

      {status && !busy && (
        <p role="alert" className="text-sm text-red-600">
          {status}
        </p>
      )}
    </div>
  );
}
