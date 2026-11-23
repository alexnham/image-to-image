import type { Layers } from "./engine/engine";

export type Point = { x: number; y: number };
export type Dimensions = { width: number; height: number };
const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
const midpoint = (points: Point[]): Point => ({
  x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
  y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
});
const distance = (points: Point[], size: Dimensions) => Math.hypot(
  (points[1].x - points[0].x) * size.width,
  (points[1].y - points[0].y) * size.height,
);

/** One undoable drag/pinch, including transitions between one and two fingers. */
export class EditorGesture {
  private points = new Map<number, Point>();
  private origins: Point[] = [];
  private base: Layers;
  current: Layers;
  changed = false;

  constructor(
    readonly original: Layers,
    private size: Dimensions,
    readonly textId?: string,
  ) {
    this.base = this.current = original;
  }

  get active() { return this.points.size > 0; }
  has(id: number) { return this.points.has(id); }

  down(id: number, point: Point) {
    if (this.points.size >= 2) return;
    this.points.set(id, point);
    this.rebase();
  }

  up(id: number) {
    this.points.delete(id);
    this.rebase();
  }

  private rebase() {
    this.base = this.current;
    this.origins = [...this.points.values()];
  }

  move(id: number, point: Point): Layers {
    if (!this.points.has(id)) return this.current;
    this.points.set(id, point);
    const points = [...this.points.values()];
    const start = midpoint(this.origins), end = midpoint(points);
    const dx = end.x - start.x, dy = end.y - start.y;
    if (this.textId) {
      this.current = {
        ...this.base,
        texts: this.base.texts.map((text) => text.id === this.textId
          ? { ...text, x: clamp(text.x + dx), y: clamp(text.y + dy) }
          : text),
      };
    } else {
      const initialDistance = points.length === 2 ? distance(this.origins, this.size) : 0;
      const scale = initialDistance > 0
        ? clamp(this.base.subject.scale * distance(points, this.size) / initialDistance, 0.05, 5)
        : this.base.subject.scale;
      // Scale around the finger midpoint, so an off-centre pinch stays anchored.
      const ratio = scale / this.base.subject.scale;
      this.current = {
        ...this.base,
        subject: {
          ...this.base.subject,
          x: clamp(end.x + (this.base.subject.x - start.x) * ratio),
          y: clamp(end.y + (this.base.subject.y - start.y) * ratio),
          scale,
        },
      };
    }
    this.changed ||= dx !== 0 || dy !== 0 || this.current.subject.scale !== this.base.subject.scale;
    return this.current;
  }
}
