"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { upload } from "@vercel/blob/client";
import type { Layers, Version } from "@/lib/engine/engine";
import type { Manual } from "@/lib/editor-schema";
import { drawLayers } from "@/lib/canvas";
import { prepareImage, validateFile } from "@/lib/image";
import { SubjectCheck } from "@/app/subject-check";
import { EditorGesture, type Dimensions } from "@/lib/editor-gesture";
import { frame } from "@/lib/frame";
import { FONT_FAMILIES } from "@/lib/fonts";

type Box = {
  text: string;
  overlay: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
};
async function jsonRequest(url: string, body: unknown, method = "POST") {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Something went wrong. Try again.");
  return data;
}
function manual(layers: Layers): Manual {
  return {
    texts: layers.texts,
    transform: {
      x: layers.subject.x,
      y: layers.subject.y,
      scale: layers.subject.scale,
      flipped: layers.subject.flipped,
    },
    adjust: layers.adjust,
    crop: layers.crop ?? "original",
    rotation: layers.rotation ?? 0,
  };
}
export function Editor({
  id,
  userId,
  initialVersions,
  remaining: initialRemaining,
}: {
  id: string;
  userId: string;
  initialVersions: Version[];
  remaining: number;
}) {
  const router = useRouter(),
    canvas = useRef<HTMLCanvasElement>(null),
    brush = useRef<HTMLCanvasElement>(null);
  const [versions, setVersions] = useState(initialVersions),
    [selected, setSelected] = useState(initialVersions[0]?.number ?? 0),
    [layers, setLayers] = useState<Layers | null>(
      initialVersions[0]?.layers ?? null,
    );
  const [remaining, setRemaining] = useState(initialRemaining),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [prompt, setPrompt] = useState(""),
    [variations, setVariations] = useState(1),
    [tab, setTab] = useState("product");
  const [dirty, setDirty] = useState(false),
    [past, setPast] = useState<Layers[]>([]),
    [future, setFuture] = useState<Layers[]>([]),
    [brushMode, setBrushMode] = useState(false),
    [brushSize, setBrushSize] = useState(35),
    [boxes, setBoxes] = useState<Box[] | null>(null),
    [swap, setSwap] = useState<{ src: string; blob: Blob } | null>(null);
  const pointer = useRef<{
    id: number;
    x: number;
    y: number;
    layers: Layers;
    paintX?: number;
    paintY?: number;
  } | null>(null);
  const gesture = useRef<EditorGesture | null>(null);
  const dimensions = useRef<Dimensions | null>(null);
  useEffect(() => {
    if (!layers || !canvas.current) return;
    let cancelled = false;
    const target = document.createElement("canvas");
    drawLayers(
      target,
      layers,
      (path) => `/api/projects/${id}/asset?path=${encodeURIComponent(path)}`,
    )
      .then((size) => {
        if (cancelled || !canvas.current) return;
        dimensions.current = size;
        canvas.current.width = target.width;
        canvas.current.height = target.height;
        canvas.current.getContext("2d")!.drawImage(target, 0, 0);
        if (
          brush.current &&
          (brush.current.width !== target.width ||
            brush.current.height !== target.height)
        ) {
          brush.current.width = target.width;
          brush.current.height = target.height;
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [layers, id]);
  useEffect(
    () => () => {
      if (swap) URL.revokeObjectURL(swap.src);
    },
    [swap],
  );
  const change = (next: Layers) => {
    if (!layers) return;
    setPast((p) => [...p.slice(-49), layers]);
    setFuture([]);
    setLayers(next);
    setDirty(true);
    setError("");
  };
  const accept = (version: Version) => {
    setVersions((v) => [
      version,
      ...v.filter((x) => x.number !== version.number),
    ]);
    setSelected(version.number);
    setLayers(version.layers);
    setDirty(false);
    setPast([]);
    setFuture([]);
    setBoxes(null);
    setBrushMode(false);
  };
  async function save(): Promise<Version | undefined> {
    if (!layers) return;
    if (!dirty) return versions.find((v) => v.number === selected);
    const data = await jsonRequest(`/api/projects/${id}/versions`, {
      fromVersion: selected,
      manual: manual(layers),
    });
    accept(data.version);
    return data.version;
  }
  async function task(label: string, work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setStatus(label);
    try {
      await work();
      setStatus("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Something went wrong. Try again.",
      );
      setStatus("");
    } finally {
      setBusy(false);
    }
  }
  async function prepare(maskPath: string) {
    const data = await jsonRequest(`/api/projects/${id}/prepare`, { maskPath });
    accept(data.version);
  }
  async function runPrompt(event: React.FormEvent) {
    event.preventDefault();
    if (!prompt.trim()) return;
    await task("Saving edits…", async () => {
      const base = await save();
      if (!base) throw new Error("Confirm your product first.");
      const response = await fetch(`/api/projects/${id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, fromVersion: base.number, variations }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }
      const reader = response.body!.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        success = false;
      for (;;) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        for (const line of lines) {
          if (!line) continue;
          const data = JSON.parse(line);
          if (data.type === "progress") setStatus(data.label);
          if (data.type === "version") {
            accept(data.version);
            setRemaining(data.remaining);
            success = true;
          }
          if (data.type === "error") throw new Error(data.message);
        }
        if (done) break;
      }
      if (success) setPrompt("");
    });
  }
  async function exportPng() {
    await task("Exporting PNG…", async () => {
      const version = await save();
      if (!version) return;
      const response = await fetch(
        `/api/projects/${id}/export?version=${version.number}`,
      );
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error);
      }
      const url = URL.createObjectURL(await response.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = "ad.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  async function deleteProject() {
    if (
      !window.confirm(
        "Permanently delete this project, its images, and all versions?",
      )
    )
      return;
    await task("Deleting project…", async () => {
      await jsonRequest(`/api/projects/${id}`, {}, "DELETE");
      router.push("/");
      router.refresh();
    });
  }
  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    };
  }
  function startDrag(e: React.PointerEvent<HTMLCanvasElement>) {
    if (busy || !layers || !dimensions.current || e.button !== 0) return;
    if (brushMode && ((layers.crop && layers.crop !== "original") || layers.rotation)) {
      setError(
        "Use Original crop and 0° rotation to paint a removal mask.",
      );
      return;
    }
    e.preventDefault();
    if (brushMode) {
      if (pointer.current) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      pointer.current = { id: e.pointerId, ...point(e), layers };
      paint(e);
      return;
    }
    const size = dimensions.current;
    const view = point(e);
    const p = frame(size.width, size.height, layers).fromView(view.x, view.y);
    if (!gesture.current) {
      let textId: string | undefined;
      if (tab === "text") {
        const ctx = e.currentTarget.getContext("2d")!;
        const rect = e.currentTarget.getBoundingClientRect();
        const viewFrame = frame(size.width, size.height, layers);
        // Keep a small touch target around visible glyphs, even for small text.
        const pad = 12 * viewFrame.width / rect.width;
        textId = layers.texts.findLast((text) => {
          ctx.font = `700 ${text.size * size.width}px "${FONT_FAMILIES[text.font ?? "sans"]}"`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const bounds = ctx.measureText(text.text);
          const x = (p.x - text.x) * size.width;
          const y = (p.y - text.y) * size.height;
          return x >= -bounds.actualBoundingBoxLeft - pad &&
            x <= bounds.actualBoundingBoxRight + pad &&
            y >= -bounds.actualBoundingBoxAscent - pad &&
            y <= bounds.actualBoundingBoxDescent + pad;
        })?.id;
        // Empty space in the Text tool must not move the product.
        if (!textId) return;
      }
      gesture.current = new EditorGesture(layers, size, textId);
    }
    gesture.current.down(e.pointerId, p);
    if (!gesture.current.has(e.pointerId)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function paint(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointer.current || pointer.current.id !== e.pointerId || !brush.current) return;
    const { x, y } = point(e);
    const ctx = brush.current.getContext("2d")!,
      r = e.currentTarget.getBoundingClientRect(),
      s = pointer.current;
    ctx.strokeStyle = "white";
    ctx.fillStyle = "white";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = (brushSize * brush.current.width) / r.width;
    ctx.beginPath();
    ctx.moveTo(
      (s.paintX ?? x) * brush.current.width,
      (s.paintY ?? y) * brush.current.height,
    );
    ctx.lineTo(x * brush.current.width, y * brush.current.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(
      x * brush.current.width,
      y * brush.current.height,
      ctx.lineWidth / 2,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    s.paintX = x;
    s.paintY = y;
  }
  function drag(e: React.PointerEvent<HTMLCanvasElement>) {
    if (brushMode) {
      paint(e);
      return;
    }
    const active = gesture.current, size = dimensions.current;
    if (!active?.has(e.pointerId) || !size) return;
    const { x, y } = point(e);
    const p = frame(size.width, size.height, active.original).fromView(x, y);
    const wasChanged = active.changed;
    const next = active.move(e.pointerId, p);
    if (!wasChanged && active.changed) {
      setPast((past) => [...past.slice(-49), active.original]);
      setFuture([]);
      setError("");
    }
    setLayers(next);
    if (active.changed) setDirty(true);
  }
  function endDrag(e: React.PointerEvent<HTMLCanvasElement>) {
    if (pointer.current?.id === e.pointerId) pointer.current = null;
    gesture.current?.up(e.pointerId);
    if (!gesture.current?.active) gesture.current = null;
  }
  async function erase() {
    await task("Removing marked object…", async () => {
      const version = await save();
      if (!version || !brush.current) return;
      const c = document.createElement("canvas");
      c.width = brush.current.width;
      c.height = brush.current.height;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "black";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(brush.current, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        c.toBlob((b) =>
          b ? resolve(b) : reject(new Error("Could not read brush.")),
        ),
      );
      const saved = await upload(
        `${userId}/${id}/brush-${crypto.randomUUID()}.png`,
        blob,
        { access: "private", handleUploadUrl: "/api/upload" },
      );
      const data = await jsonRequest(`/api/projects/${id}/remove`, {
        fromVersion: version.number,
        maskPath: saved.pathname,
      });
      accept(data.version);
      brush.current?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    });
  }
  async function selectSwap(file: File) {
    const invalid = validateFile(file);
    if (invalid) {
      setError(invalid);
      return;
    }
    await task("Preparing photo…", async () => {
      const blob = await prepareImage(file);
      setSwap({ src: URL.createObjectURL(blob), blob });
    });
  }
  if (!layers)
    return (
      <>
        <SubjectCheck
          src={`/projects/${id}/image`}
          userId={userId}
          projectId={id}
          onConfirm={prepare}
        />
        <div className="notice">
          Product detection runs on your device. Preparing a clean background
          uses the AI service but does not spend a free prompt.
        </div>
        <button className="danger" onClick={deleteProject} disabled={busy}>
          Delete project
        </button>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </>
    );
  if (swap)
    return (
      <SubjectCheck
        src={swap.src}
        userId={userId}
        projectId={id}
        onCancel={() => setSwap(null)}
        onConfirm={async (maskPath) => {
          const version = await save();
          const image = await upload(
            `${userId}/${id}/swap-${crypto.randomUUID()}.png`,
            swap.blob,
            { access: "private", handleUploadUrl: "/api/upload" },
          );
          const data = await jsonRequest(`/api/projects/${id}/swap`, {
            fromVersion: version!.number,
            imagePath: image.pathname,
            maskPath,
          });
          accept(data.version);
          setSwap(null);
        }}
      />
    );
  return (
    <>
      <div className="editor-heading">
        <div>
          <h1>Your photo. A better ad.</h1>
          <p>Keep the product. Change the possibilities.</p>
        </div>
        <div className="export-actions">
          <span className="allowance">{remaining} free prompts left</span>
          <button className="primary" disabled={busy} onClick={exportPng}>
            Export PNG
          </button>
        </div>
      </div>
      <div className="editor-grid">
        <section className="workspace" aria-label="Ad preview">
          <div className="canvas-tools">
            <div>
              <button
                disabled={busy || !past.length}
                onClick={() => {
                  setFuture((f) => [layers, ...f]);
                  setLayers(past.at(-1)!);
                  setPast((p) => p.slice(0, -1));
                  setDirty(true);
                }}
              >
                Undo
              </button>
              <button
                disabled={busy || !future.length}
                onClick={() => {
                  setPast((p) => [...p, layers]);
                  setLayers(future[0]);
                  setFuture((f) => f.slice(1));
                  setDirty(true);
                }}
              >
                Redo
              </button>
            </div>
            <span>{dirty ? "Unsaved edits" : `Version ${selected + 1}`}</span>
            <button
              disabled={busy || !dirty}
              onClick={() =>
                task("Saving…", async () => {
                  await save();
                })
              }
            >
              Save
            </button>
          </div>
          <div className="canvas-surround">
            <div className="canvas-wrap">
              <canvas
                ref={canvas}
                aria-label="Your ad; drag to move product or text, pinch to resize product"
                onPointerDown={startDrag}
                onPointerMove={drag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                onLostPointerCapture={endDrag}
              />
              <canvas
                ref={brush}
                className={`brush-overlay ${brushMode ? "visible" : ""}`}
                aria-hidden="true"
              />
            </div>
          </div>
          <p className="canvas-hint">
            {brushMode
              ? "Paint over the object, then choose Remove marked area. The product is protected."
              : tab === "text"
                ? "Drag text on the photo to move it. Use the controls to edit its words and style."
                : "Drag your product to move it. Pinch with two fingers to resize."}
          </p>
          <form onSubmit={runPrompt} className="prompt-form">
            <label htmlFor="prompt">Describe your next edit</label>
            <textarea
              id="prompt"
              placeholder={
                "Try “Put it on a café table in morning light, headline says Fresh daily”"
              }
              value={prompt}
              maxLength={2000}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={busy}
            />
            <div className="prompt-actions">
              <label>
                Variations{" "}
                <select
                  value={variations}
                  onChange={(e) => setVariations(+e.target.value)}
                  disabled={busy}
                >
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                </select>
              </label>
              <span>
                {variations} free prompt{variations > 1 ? "s" : ""}
              </span>
              <button
                className="primary"
                disabled={busy || !prompt.trim() || remaining < variations}
              >
                Make the edit
              </button>
            </div>
          </form>
        </section>
        <aside className="inspector">
          <div className="tabs" role="tablist" aria-label="Editing tools">
            {["product", "text", "look", "history"].map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                aria-controls={`panel-${t}`}
                id={`tab-${t}`}
                onClick={() => setTab(t)}
              >
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          <div
            className="inspector-content"
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
          >
            <fieldset disabled={busy}>
              {tab === "product" && (
                <>
                  <h2>Product</h2>
                  <p>Original details, in a new setting.</p>
                  {(["x", "y", "scale"] as const).map((key) => (
                    <label key={key} className="control">
                      {key === "x"
                        ? "Horizontal position"
                        : key === "y"
                          ? "Vertical position"
                          : "Size"}
                      <input
                        type="range"
                        min={key === "scale" ? 0.05 : 0}
                        max={key === "scale" ? 5 : 1}
                        step="0.01"
                        value={layers.subject[key]}
                        onChange={(e) =>
                          change({
                            ...layers,
                            subject: {
                              ...layers.subject,
                              [key]: +e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                  <button
                    onClick={() =>
                      change({
                        ...layers,
                        subject: {
                          ...layers.subject,
                          flipped: !layers.subject.flipped,
                        },
                      })
                    }
                  >
                    Flip horizontally
                  </button>
                  <label className="file-button">
                    Swap product photo
                    <input
                      type="file"
                      accept="image/*,.heic,.heif"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) selectSwap(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  <hr />
                  <h3>Remove a distraction</h3>
                  <p>
                    Paint the background object you want to erase. This uses AI,
                    but no free prompt.
                  </p>
                  <button
                    aria-pressed={brushMode}
                    onClick={() => {
                      change({ ...layers, crop: "original", rotation: 0 });
                      setBrushMode(!brushMode);
                    }}
                  >
                    {brushMode ? "Close brush" : "Open remove brush"}
                  </button>
                  {brushMode && (
                    <>
                      <label className="control">
                        Brush size
                        <input
                          type="range"
                          min="5"
                          max="100"
                          value={brushSize}
                          onChange={(e) => setBrushSize(+e.target.value)}
                        />
                      </label>
                      <button
                        onClick={() =>
                          brush.current
                            ?.getContext("2d")
                            ?.clearRect(
                              0,
                              0,
                              brush.current.width,
                              brush.current.height,
                            )
                        }
                      >
                        Clear marks
                      </button>
                      <button className="primary" onClick={erase}>
                        Remove marked area
                      </button>
                    </>
                  )}
                </>
              )}
              {tab === "text" && (
                <>
                  <h2>Text</h2>
                  <p>Real typography. Always editable.</p>
                  <button
                    onClick={() =>
                      change({
                        ...layers,
                        texts: [
                          ...layers.texts,
                          {
                            id: crypto.randomUUID(),
                            text: "Your headline",
                            x: 0.5,
                            y: 0.08,
                            size: 0.08,
                            color: "#ffffff",
                            font: "sans",
                          },
                        ],
                      })
                    }
                    disabled={layers.texts.length >= 20}
                  >
                    Add text
                  </button>
                  {layers.texts.map((t, index) => (
                    <section className="text-control" key={t.id}>
                      <label>
                        Text {index + 1}
                        <input
                          value={t.text}
                          maxLength={500}
                          onChange={(e) =>
                            change({
                              ...layers,
                              texts: layers.texts.map((x) =>
                                x.id === t.id
                                  ? { ...x, text: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <div className="two-controls">
                        <label>
                          Font
                          <select
                            value={t.font ?? "sans"}
                            onChange={(e) =>
                              change({
                                ...layers,
                                texts: layers.texts.map((x) =>
                                  x.id === t.id
                                    ? {
                                        ...x,
                                        font: e.target.value as
                                          | "sans"
                                          | "serif"
                                          | "display",
                                      }
                                    : x,
                                ),
                              })
                            }
                          >
                            <option value="sans">Clean sans</option>
                            <option value="serif">Classic serif</option>
                            <option value="display">Bold display</option>
                          </select>
                        </label>
                        <label>
                          Color
                          <input
                            type="color"
                            value={t.color}
                            onChange={(e) =>
                              change({
                                ...layers,
                                texts: layers.texts.map((x) =>
                                  x.id === t.id
                                    ? { ...x, color: e.target.value }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                      </div>
                      {(["size", "x", "y"] as const).map((key) => (
                        <label className="control" key={key}>
                          {key === "size"
                            ? "Size"
                            : key === "x"
                              ? "Horizontal position"
                              : "Vertical position"}
                          <input
                            type="range"
                            min={key === "size" ? 0.01 : 0}
                            max={key === "size" ? 0.5 : 1}
                            step=".01"
                            value={t[key]}
                            onChange={(e) =>
                              change({
                                ...layers,
                                texts: layers.texts.map((x) =>
                                  x.id === t.id
                                    ? { ...x, [key]: +e.target.value }
                                    : x,
                                ),
                              })
                            }
                          />
                        </label>
                      ))}
                      <button
                        className="danger"
                        onClick={() =>
                          change({
                            ...layers,
                            texts: layers.texts.filter((x) => x.id !== t.id),
                          })
                        }
                      >
                        Remove text
                      </button>
                    </section>
                  ))}
                  <hr />
                  <h3>Text already in your photo?</h3>
                  <p>
                    Find overlays and choose which to lift. Packaging labels
                    stay protected.
                  </p>
                  <button
                    onClick={() =>
                      task("Finding text…", async () => {
                        const v = await save();
                        const data = await jsonRequest(
                          `/api/projects/${id}/text`,
                          { fromVersion: v!.number },
                        );
                        setBoxes(data.boxes);
                      })
                    }
                  >
                    Find text overlays
                  </button>
                  {boxes && (
                    <div className="detected-text">
                      {!boxes.length && (
                        <p>No text found. You can add text above.</p>
                      )}
                      {boxes.map((b, i) => (
                        <label key={i}>
                          <input
                            type="checkbox"
                            checked={b.overlay}
                            onChange={(e) =>
                              setBoxes(
                                boxes.map((x, j) =>
                                  j === i
                                    ? { ...x, overlay: e.target.checked }
                                    : x,
                                ),
                              )
                            }
                          />
                          {b.text}
                        </label>
                      ))}
                      {boxes.length > 0 && (
                        <button
                          disabled={!boxes.some((b) => b.overlay)}
                          onClick={() =>
                            task("Lifting selected text…", async () => {
                              const v = await save();
                              const data = await jsonRequest(
                                `/api/projects/${id}/text`,
                                { fromVersion: v!.number, boxes },
                              );
                              accept(data.version);
                            })
                          }
                        >
                          Lift selected overlays
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
              {tab === "look" && (
                <>
                  <h2>Look & frame</h2>
                  <p>Fine-tune without spending a prompt.</p>
                  {(
                    Object.keys(layers.adjust) as (keyof Layers["adjust"])[]
                  ).map((key) => (
                    <label className="control" key={key}>
                      {key[0].toUpperCase() + key.slice(1)}
                      <input
                        type="range"
                        min={key === "grain" ? 0 : -1}
                        max="1"
                        step=".01"
                        value={layers.adjust[key]}
                        onChange={(e) =>
                          change({
                            ...layers,
                            adjust: {
                              ...layers.adjust,
                              [key]: +e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                  <label className="control">
                    Crop
                    <select
                      value={layers.crop ?? "original"}
                      onChange={(e) =>
                        change({
                          ...layers,
                          crop: e.target.value as Layers["crop"],
                        })
                      }
                    >
                      <option value="original">Original aspect ratio</option>
                      <option value="square">Square · 1:1</option>
                      <option value="portrait">Feed · 4:5</option>
                    </select>
                  </label>
                  <label className="control">
                    Rotation
                    <select
                      value={layers.rotation ?? 0}
                      onChange={(e) =>
                        change({
                          ...layers,
                          rotation: +e.target.value as Layers["rotation"],
                        })
                      }
                    >
                      {[0, 90, 180, 270].map((n) => (
                        <option key={n} value={n}>
                          {n}°
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {tab === "history" && (
                <>
                  <h2>Every version, kept.</h2>
                  <p>Continue from any version. Newer versions stay here.</p>
                  <ol className="version-list">
                    {versions.map((v) => (
                      <li key={v.number}>
                        <button
                          aria-current={
                            v.number === selected ? "true" : undefined
                          }
                          onClick={() => {
                            if (
                              dirty &&
                              !window.confirm(
                                "Discard unsaved manual edits and open this version?",
                              )
                            )
                              return;
                            setSelected(v.number);
                            setLayers(v.layers);
                            setDirty(false);
                            setPast([]);
                            setFuture([]);
                            setBrushMode(false);
                          }}
                        >
                          <strong>Version {v.number + 1}</strong>
                          <span>{v.prompt ?? "Original photo"}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </fieldset>
          </div>
          <div className="inspector-footer">
            <span>Manual edits are always free.</span>
            <button className="danger" disabled={busy} onClick={deleteProject}>
              Delete project
            </button>
          </div>
        </aside>
      </div>
      <div className="editor-feedback" aria-live="polite">
        {busy && (
          <p role="status" className="status">
            <span className="spinner" />
            {status} Keep this page open.
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </>
  );
}
