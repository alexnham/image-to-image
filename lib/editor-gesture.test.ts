import { describe, expect, it } from "vitest";
import { EditorGesture } from "./editor-gesture";
import type { Layers } from "./engine/engine";
import { frame } from "./frame";

const size = { width: 1600, height: 900 };
const layers: Layers = {
  background: "background",
  subject: { original: "original", image: "cutout", matte: "matte", x: 0.5, y: 0.5, scale: 1, flipped: false },
  shadow: "shadow",
  texts: [{ id: "headline", text: "Fresh daily", x: 0.4, y: 0.1, size: 0.08, color: "#ffffff" }],
  adjust: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, grain: 0 },
};

describe("canvas gestures", () => {
  it("moves the product and its attached shadow without changing the original snapshot", () => {
    const drag = new EditorGesture(layers, size);
    drag.down(1, { x: 0.5, y: 0.5 });
    const next = drag.move(1, { x: 0.7, y: 0.6 });
    expect(next.subject).toMatchObject({ x: 0.7, y: 0.6, scale: 1, original: "original", image: "cutout", matte: "matte" });
    expect(next.shadow).toBe("shadow");
    expect(drag.original.subject.x).toBe(0.5);
    expect(drag.changed).toBe(true);
  });

  it("pinches around the finger midpoint and keeps product details and shadow attached", () => {
    const drag = new EditorGesture(layers, size);
    drag.down(1, { x: 0.2, y: 0.5 });
    drag.down(2, { x: 0.4, y: 0.5 });
    const next = drag.move(2, { x: 0.6, y: 0.5 });
    expect(next.subject.scale).toBeCloseTo(2);
    expect(next.subject.x).toBeCloseTo(0.8);
    expect(next.subject.original).toBe(layers.subject.original);
    expect(next.shadow).toBe(layers.shadow);
  });

  it("rebases when adding or lifting a finger, preserving one undo snapshot", () => {
    const drag = new EditorGesture(layers, size);
    drag.down(1, { x: 0.3, y: 0.5 });
    drag.move(1, { x: 0.4, y: 0.5 });
    drag.down(2, { x: 0.6, y: 0.5 });
    expect(drag.move(2, { x: 0.6, y: 0.5 }).subject.x).toBeCloseTo(0.6);
    drag.move(2, { x: 0.8, y: 0.5 });
    const beforeLift = drag.current;
    drag.up(2);
    const next = drag.move(1, { x: 0.45, y: 0.5 });
    expect(next.subject.x).toBeCloseTo(beforeLift.subject.x + 0.05);
    expect(next.subject.scale).toBe(beforeLift.subject.scale);
    expect(drag.original).toBe(layers);
    drag.up(1);
    expect(drag.active).toBe(false);
    expect(drag.move(1, { x: 0, y: 0 })).toBe(next);
  });

  it("ignores extra fingers and keeps a stationary tap out of undo history", () => {
    const drag = new EditorGesture(layers, size);
    drag.down(1, { x: 0.3, y: 0.5 });
    drag.move(1, { x: 0.3, y: 0.5 });
    expect(drag.changed).toBe(false);
    drag.down(2, { x: 0.7, y: 0.5 });
    drag.down(3, { x: 0.9, y: 0.5 });
    expect(drag.has(3)).toBe(false);
  });

  it("clamps product scale to the range accepted by manual save", () => {
    const drag = new EditorGesture(layers, size);
    drag.down(1, { x: 0.5, y: 0.5 });
    drag.down(2, { x: 0.6, y: 0.5 });
    expect(drag.move(2, { x: 10, y: 0.5 }).subject.scale).toBe(5);
    expect(drag.move(2, { x: 0.5, y: 0.5 }).subject.scale).toBe(0.05);
  });

  it("moves only the selected text and clamps it to the canvas", () => {
    const drag = new EditorGesture(layers, size, "headline");
    drag.down(1, { x: 0.4, y: 0.1 });
    const next = drag.move(1, { x: 0.6, y: 0.3 });
    expect(next.texts[0].x).toBeCloseTo(0.6);
    expect(next.texts[0].y).toBeCloseTo(0.3);
    expect(next.subject).toBe(layers.subject);
    expect(next.texts[0].text).toBe("Fresh daily");
    expect(drag.move(1, { x: -1, y: 2 }).texts[0]).toMatchObject({ x: 0, y: 1 });
    expect(layers.texts[0]).toMatchObject({ x: 0.4, y: 0.1 });
  });

  it.each([0, 90, 180, 270] as const)("moves right on screen in a cropped %i° view", (rotation) => {
    const base = { ...layers, crop: "square" as const, rotation };
    const view = frame(size.width, size.height, base);
    const drag = new EditorGesture(base, size);
    drag.down(1, view.fromView(0.5, 0.5));
    const next = drag.move(1, view.fromView(0.6, 0.5));
    expect(view.toView(next.subject.x, next.subject.y).x).toBeCloseTo(0.6);
    expect(view.toView(next.subject.x, next.subject.y).y).toBeCloseTo(0.5);
  });
});
