import { z } from "zod";
const unit = z.number().min(0).max(1);
const signed = z.number().min(-1).max(1);
export const TextSchema = z.object({
  id: z.string().min(1).max(80),
  text: z.string().max(500),
  x: unit,
  y: unit,
  size: z.number().min(0.01).max(0.5),
  color: z.string().regex(/^#[a-f\d]{6}$/i),
  font: z.enum(["sans", "serif", "display"]).optional(),
});
export const ManualSchema = z.object({
  texts: z.array(TextSchema).max(20),
  transform: z.object({
    x: unit,
    y: unit,
    scale: z.number().min(0.05).max(5),
    flipped: z.boolean(),
  }),
  adjust: z.object({
    brightness: signed,
    contrast: signed,
    saturation: signed,
    warmth: signed,
    grain: unit,
  }),
  crop: z.enum(["original", "square", "portrait"]),
  rotation: z.union([
    z.literal(0),
    z.literal(90),
    z.literal(180),
    z.literal(270),
  ]),
});
export type Manual = z.infer<typeof ManualSchema>;
export const EMPTY_ADJUST = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  grain: 0,
};
