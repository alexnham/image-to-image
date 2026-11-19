"use client";
import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
export function SubjectCheck({
  src,
  userId,
  projectId,
  onConfirm,
  onCancel,
}: {
  src: string;
  userId: string;
  projectId: string;
  onConfirm: (maskPath: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null),
    mask = useRef<HTMLCanvasElement | null>(null),
    image = useRef<HTMLImageElement | null>(null);
  const userEdited = useRef(false);
  const painting = useRef(false),
    last = useRef<{ x: number; y: number } | null>(null);
  const [status, setStatus] = useState("Loading photo…"),
    [mode, setMode] = useState<"add" | "remove">("add"),
    [size, setSize] = useState(35),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false);
  const draw = () => {
    const c = canvas.current,
      m = mask.current,
      img = image.current;
    if (!c || !m || !img) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0);
    const overlay = document.createElement("canvas");
    overlay.width = m.width;
    overlay.height = m.height;
    const oc = overlay.getContext("2d")!;
    oc.drawImage(m, 0, 0);
    oc.globalCompositeOperation = "source-in";
    oc.fillStyle = "rgba(30,160,180,.45)";
    oc.fillRect(0, 0, m.width, m.height);
    ctx.drawImage(overlay, 0, 0);
  };
  useEffect(() => {
    let disposed = false;
    userEdited.current = false;
    let worker: Worker | undefined;
    const img = new Image();
    img.onload = () => {
      if (disposed || !canvas.current) return;
      image.current = img;
      const c = canvas.current;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const m = document.createElement("canvas");
      m.width = c.width;
      m.height = c.height;
      mask.current = m;
      draw();
      setReady(true);
      worker = new Worker(new URL("../lib/segment.worker.ts", import.meta.url));
      worker.onmessage = (e) => {
        if (disposed || userEdited.current) return;
        if (e.data.type === "progress") setStatus(e.data.message);
        if (e.data.type === "error") setStatus(e.data.message);
        if (e.data.type === "done") {
          const { width, height, mask: values } = e.data;
          const tmp = document.createElement("canvas");
          tmp.width = width;
          tmp.height = height;
          const data = new ImageData(width, height);
          for (let i = 0; i < values.length; i++) {
            data.data[i * 4] = 255;
            data.data[i * 4 + 1] = 255;
            data.data[i * 4 + 2] = 255;
            data.data[i * 4 + 3] = values[i];
          }
          tmp.getContext("2d")!.putImageData(data, 0, 0);
          m.getContext("2d")!.clearRect(0, 0, m.width, m.height);
          m.getContext("2d")!.drawImage(tmp, 0, 0, m.width, m.height);
          draw();
          setStatus(
            "Check the blue selection. Paint to add or remove parts of your product.",
          );
          worker?.terminate();
        }
      };
      worker.onerror = () =>
        setStatus(
          "Automatic detection could not run. Paint over your product to select it.",
        );
      worker.postMessage({ url: src });
    };
    img.onerror = () =>
      setStatus("Couldn't load the photo. Reload and try again.");
    img.src = src;
    return () => {
      disposed = true;
      worker?.terminate();
    };
    // The source fully determines a fresh selection.
  }, [src]);
  function paint(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!painting.current || !mask.current) return;
    const c = e.currentTarget,
      rect = c.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * c.width) / rect.width,
      y = ((e.clientY - rect.top) * c.height) / rect.height;
    const ctx = mask.current.getContext("2d")!;
    ctx.globalCompositeOperation =
      mode === "add" ? "source-over" : "destination-out";
    ctx.strokeStyle = "white";
    ctx.fillStyle = "white";
    ctx.lineWidth = (size * c.width) / rect.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(last.current?.x ?? x, last.current?.y ?? y);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, ctx.lineWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    last.current = { x, y };
    draw();
  }
  async function confirm() {
    if (!mask.current) return;
    setBusy(true);
    try {
      setStatus("Preparing product and clean background…");
      const m = mask.current;
      const output = document.createElement("canvas");
      output.width = m.width;
      output.height = m.height;
      const ctx = output.getContext("2d")!;
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, m.width, m.height);
      ctx.drawImage(m, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        output.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Mask export failed"))),
          "image/png",
        ),
      );
      const saved = await upload(
        `${userId}/${projectId}/mask-${crypto.randomUUID()}.png`,
        blob,
        { access: "private", handleUploadUrl: "/api/upload" },
      );
      await onConfirm(saved.pathname);
    } catch (e) {
      setStatus(
        e instanceof Error ? e.message : "Couldn't prepare product. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="subject-check">
      <div className="section-heading">
        <div>
          <h2>Protect your product</h2>
          <p>The blue area keeps your original photo pixels.</p>
        </div>
        {onCancel && (
          <button onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
      </div>
      <canvas
        ref={canvas}
        className="selection-canvas"
        aria-label="Paint product selection"
        onPointerDown={(e) => {
          userEdited.current = true;
          painting.current = true;
          last.current = null;
          e.currentTarget.setPointerCapture(e.pointerId);
          paint(e);
        }}
        onPointerMove={paint}
        onPointerUp={() => {
          painting.current = false;
          last.current = null;
        }}
        onPointerCancel={() => {
          painting.current = false;
          last.current = null;
        }}
      />
      <div className="toolbar">
        <button aria-pressed={mode === "add"} onClick={() => setMode("add")}>
          Add to product
        </button>
        <button
          aria-pressed={mode === "remove"}
          onClick={() => setMode("remove")}
        >
          Remove from product
        </button>
        <label>
          Brush{" "}
          <input
            type="range"
            min="5"
            max="100"
            value={size}
            onChange={(e) => setSize(+e.target.value)}
          />
        </label>
        <button className="primary" onClick={confirm} disabled={busy || !ready}>
          {busy ? "Preparing…" : "Looks right"}
        </button>
      </div>
      <p role="status">{status}</p>
    </section>
  );
}
