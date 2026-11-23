"use client";

import { useState } from "react";

export function VersionThumbnail({ projectId, number }: { projectId: string; number: number }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="version-thumbnail" aria-hidden="true">
      {failed ? (
        <span>Preview unavailable</span>
      ) : (
        // Authenticated private route; use the browser's session, not the image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/projects/${projectId}/thumbnail?version=${number}`}
          alt=""
          loading="lazy"
          decoding="async"
          width={64}
          height={64}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
