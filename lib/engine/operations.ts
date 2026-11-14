import { z } from "zod";

// Positions and sizes are fractions of the canvas, so they survive resizing and cropping.
const unit = z.number().min(0).max(1);
const signed = z.number().min(-1).max(1);
const color = z.string().regex(/^#[0-9a-f]{6}$/i);
const region = z.object({ x: unit, y: unit, w: unit, h: unit });

/** The only steps the planner may choose. Anything else is refused, never approximated. */
export const Operation = z.discriminatedUnion("op", [
  z.object({ op: z.literal("replace_background"), scene: z.string().min(1) }),
  z.object({ op: z.literal("relight"), direction: z.enum(["left", "right", "top", "front", "back"]), warmth: signed, softness: unit }),
  z.object({ op: z.literal("add_shadow") }),
  z.object({ op: z.literal("add_text"), text: z.string().min(1), x: unit, y: unit, size: unit.optional(), color: color.optional() }),
  z.object({ op: z.literal("set_text"), id: z.string(), text: z.string().min(1).optional(), x: unit.optional(), y: unit.optional(), size: unit.optional(), color: color.optional() }),
  z.object({ op: z.literal("remove_text"), id: z.string() }),
  z.object({ op: z.literal("move_subject"), dx: signed, dy: signed }),
  z.object({ op: z.literal("scale_subject"), factor: z.number().min(0.1).max(5) }),
  z.object({ op: z.literal("remove_object"), region }),
  z.object({ op: z.literal("adjust"), brightness: signed.optional(), contrast: signed.optional(), saturation: signed.optional(), warmth: signed.optional(), grain: unit.optional() }),
]);

/** What the planner returns for one prompt: steps to run, or a refusal for anything outside the list. */
export const Plan = z.object({
  operations: z.array(Operation).max(8),
  refusal: z.string().optional(),
});

export type Operation = z.infer<typeof Operation>;
export type Plan = z.infer<typeof Plan>;
export type Region = z.infer<typeof region>;
export type RelightParams = Omit<Extract<Operation, { op: "relight" }>, "op">;
