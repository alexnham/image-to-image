"use client";

export function ExportButton({ src }: { src: string }) {
  async function exportPng() {
    const bitmap = await createImageBitmap(await (await fetch(src)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    const url = URL.createObjectURL(await canvas.convertToBlob({ type: "image/png" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "ad.png" });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button onClick={exportPng} className="rounded-full bg-foreground px-6 py-3 font-medium text-background">
      Export PNG
    </button>
  );
}
