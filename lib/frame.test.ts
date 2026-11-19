import { expect, it } from "vitest";
import { frame } from "./frame";
it("keeps every crop inside odd and narrow images and round-trips coordinates through rotations", () => {
  for (const [width, height] of [
    [2048, 1367],
    [200, 100],
    [1, 2048],
    [2048, 1],
  ])
    for (const rotation of [0, 90, 180, 270] as const)
      for (const crop of ["original", "square", "portrait"] as const) {
        const f = frame(width, height, { rotation, crop });
        const rw = rotation % 180 ? height : width,
          rh = rotation % 180 ? width : height;
        expect(f.width).toBeGreaterThan(0);
        expect(f.height).toBeGreaterThan(0);
        expect(f.left).toBeGreaterThanOrEqual(0);
        expect(f.top).toBeGreaterThanOrEqual(0);
        expect(f.left + f.width).toBeLessThanOrEqual(rw);
        expect(f.top + f.height).toBeLessThanOrEqual(rh);
        if (crop === "portrait" && rw >= 4 && rh >= 5)
          expect(f.width / f.height).toBe(0.8);
        for (const [x, y] of [
          [0.1, 0.2],
          [0.5, 0.5],
          [0.99, 0.01],
        ]) {
          const visible = f.toView(x, y),
            original = f.fromView(visible.x, visible.y);
          expect(original.x).toBeCloseTo(x);
          expect(original.y).toBeCloseTo(y);
        }
      }
});
