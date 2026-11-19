import { beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { Layers } from "../engine/engine";
const { vision, render, readImage } = vi.hoisted(() => ({
  vision: vi.fn(),
  render: vi.fn(),
  readImage: vi.fn(),
}));
vi.mock("./openai", () => ({ vision }));
vi.mock("./render", () => ({ render }));
vi.mock("./assets", () => ({ readImage }));
import { planner } from "./planner";
const base: Layers = {
  background: "bg",
  subject: {
    original: "s",
    image: "s",
    matte: "m",
    x: 0.5,
    y: 0.5,
    scale: 1,
    flipped: false,
  },
  shadow: null,
  texts: [],
  adjust: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, grain: 0 },
};
beforeEach(async () => {
  vision.mockReset();
  const image = await sharp({
    create: { width: 200, height: 100, channels: 4, background: "white" },
  })
    .png()
    .toBuffer();
  render.mockResolvedValue(image);
  readImage.mockResolvedValue(image);
});
it("maps a removal region from the visible square crop back to original pixels", async () => {
  vision.mockResolvedValue({
    refusal: null,
    operations: [
      {
        op: "remove_object",
        args: JSON.stringify({ region: { x: 0.2, y: 0.1, w: 0.2, h: 0.2 } }),
      },
    ],
  });
  const plan = await planner().plan("Remove that cable", {
    ...base,
    crop: "square",
  });
  const op = plan.operations[0];
  expect(op.op).toBe("remove_object");
  if (op.op !== "remove_object") throw new Error();
  expect(op.region.x).toBeCloseTo(0.35);
  expect(op.region.w).toBeCloseTo(0.1);
  expect(op.region.y).toBeCloseTo(0.1);
});
it("maps rotated crop placement and movement into the unrotated canvas", async () => {
  vision.mockResolvedValue({
    refusal: null,
    operations: [
      {
        op: "add_text",
        args: JSON.stringify({ text: "Sale", x: 0.2, y: 0.1 }),
      },
      { op: "move_subject", args: JSON.stringify({ dx: 0.1, dy: 0.2 }) },
    ],
  });
  const plan = await planner().plan("Add Sale at top and move product", {
    ...base,
    crop: "square",
    rotation: 90,
  });
  expect(plan.operations[0]).toMatchObject({ op: "add_text", x: 0.3, y: 0.8 });
  const move = plan.operations[1];
  if (move.op !== "move_subject") throw new Error();
  expect(move.dx).toBeCloseTo(0.1);
  expect(move.dy).toBeCloseTo(-0.1);
});
it("decodes a multi-change plan and preserves explicit unsupported refusals", async () => {
  vision.mockResolvedValueOnce({
    refusal: null,
    operations: [
      { op: "replace_background", args: '{"scene":"café table"}' },
      { op: "add_text", args: '{"text":"Fresh daily","x":0.5,"y":0.1}' },
    ],
  });
  expect(
    (
      await planner().plan("Café table, headline Fresh daily", base)
    ).operations.map((x) => x.op),
  ).toEqual(["replace_background", "add_text"]);
  vision.mockResolvedValueOnce({
    refusal: "Can't do that yet",
    operations: [],
  });
  expect(await planner().plan("Turn it into a dragon", base)).toEqual({
    operations: [],
    refusal: "Can't do that yet",
  });
  vision.mockResolvedValueOnce({
    refusal: null,
    operations: [{ op: "recolor_product", args: "{}" }],
  });
  await expect(planner().plan("Recolor it", base)).rejects.toThrow();
});
