import { UserError } from "../errors";
import {
  Plan,
  type Operation,
  type Region,
  type RelightParams,
} from "./operations";

/** A stored image (Blob pathname). Pixels never travel through the engine itself. */
export type ImageRef = string;

export type TextLayer = {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  color: string;
  font?: "sans" | "serif" | "display";
};
export type Adjustments = {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  grain: number;
};

export type Layers = {
  crop?: "original" | "square" | "portrait";
  rotation?: 0 | 90 | 180 | 270;
  background: ImageRef;
  subject: {
    /** The uploaded subject pixels. Never replaced by any operation. */
    original: ImageRef;
    /** What is drawn: the original, or the original with only its light changed. */
    image: ImageRef;
    matte: ImageRef;
    /** Centre position and scale as fractions of the canvas. */
    x: number;
    y: number;
    scale: number;
    flipped: boolean;
    lighting?: RelightParams;
  };
  shadow: ImageRef | null;
  texts: TextLayer[];
  adjust: Adjustments;
};

export type Version = {
  projectId: string;
  number: number;
  layers: Layers;
  prompt: string | null;
};

/** Model-backed steps. Each returns a new stored image; tests use fakes. */
export type Providers = {
  replaceBackground(layers: Layers, scene: string): Promise<ImageRef>;
  /** Returns a new subject image with the light transferred onto the original pixels. */
  relight(layers: Layers, light: RelightParams): Promise<ImageRef>;
  renderShadow(layers: Layers): Promise<ImageRef>;
  removeObject(image: ImageRef, region: Region): Promise<ImageRef>;
};

export type Planner = {
  plan(prompt: string, layers: Layers): Promise<unknown>;
};

export type VersionStore = {
  /** The given version, or the latest when `number` is omitted. */
  get(projectId: string, number?: number): Promise<Version | null>;
  /** Saves `layers` as the new latest version. */
  append(projectId: string, layers: Layers, prompt: string): Promise<Version>;
};

export type PromptResult =
  | { kind: "done"; version: Version }
  | { kind: "refused"; message: string }
  | { kind: "failed"; message: string };

const PROGRESS: Record<Operation["op"], string> = {
  replace_background: "Replacing background…",
  relight: "Matching light…",
  add_shadow: "Adding shadow…",
  add_text: "Adding text…",
  set_text: "Updating text…",
  remove_text: "Removing text…",
  move_subject: "Moving product…",
  scale_subject: "Resizing product…",
  remove_object: "Removing object…",
  adjust: "Adjusting colors…",
};

// Steps after which the shadow no longer matches and must be redrawn.
const RESHADOW = new Set<Operation["op"]>([
  "replace_background",
  "move_subject",
  "scale_subject",
  "add_shadow",
]);

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

async function apply(
  layers: Layers,
  op: Operation,
  providers: Providers,
): Promise<Layers> {
  switch (op.op) {
    case "replace_background":
      return {
        ...layers,
        background: await providers.replaceBackground(layers, op.scene),
      };
    case "relight": {
      const { op: _, ...light } = op;
      return {
        ...layers,
        subject: {
          ...layers.subject,
          image: await providers.relight(layers, light),
          lighting: light,
        },
      };
    }
    case "add_shadow":
      return layers; // drawn once after all steps
    case "add_text":
      return {
        ...layers,
        texts: [
          ...layers.texts,
          {
            id: crypto.randomUUID(),
            text: op.text,
            x: op.x,
            y: op.y,
            size: op.size ?? 0.08,
            color: op.color ?? "#ffffff",
          },
        ],
      };
    case "set_text": {
      if (!layers.texts.some((t) => t.id === op.id))
        throw new Error(`No text layer ${op.id}`);
      const { op: _, id, ...changes } = op;
      return {
        ...layers,
        texts: layers.texts.map((t) =>
          t.id === id ? { ...t, ...changes } : t,
        ),
      };
    }
    case "remove_text":
      return { ...layers, texts: layers.texts.filter((t) => t.id !== op.id) };
    case "move_subject":
      return {
        ...layers,
        subject: {
          ...layers.subject,
          x: clamp(layers.subject.x + op.dx),
          y: clamp(layers.subject.y + op.dy),
        },
      };
    case "scale_subject":
      return {
        ...layers,
        subject: {
          ...layers.subject,
          scale: clamp(layers.subject.scale * op.factor, 0.05, 5),
        },
      };
    case "remove_object":
      return {
        ...layers,
        background: await providers.removeObject(layers.background, op.region),
      };
    case "adjust": {
      const { op: _, ...changes } = op;
      return { ...layers, adjust: { ...layers.adjust, ...changes } };
    }
  }
}

/**
 * Turns one prompt into a new version: plan → run each step → save. Nothing is saved unless
 * every step succeeds, so a failure leaves the project exactly as it was.
 * shortcut: images created by steps before a failure are left orphaned in Blob; sweep them when storage cost matters.
 */
export async function runPrompt(
  deps: { planner: Planner; providers: Providers; store: VersionStore },
  {
    projectId,
    prompt,
    fromVersion,
    onProgress,
  }: {
    projectId: string;
    prompt: string;
    fromVersion?: number;
    onProgress?: (label: string) => void;
  },
): Promise<PromptResult> {
  const base = await deps.store.get(projectId, fromVersion);
  if (!base) return { kind: "failed", message: "Project not found." };

  let plan: Plan;
  try {
    // The planner is an LLM: its output is untrusted until it matches the operation list.
    const parsed = Plan.safeParse(await deps.planner.plan(prompt, base.layers));
    if (!parsed.success)
      return {
        kind: "failed",
        message: "Couldn't understand that edit. Try rephrasing it.",
      };
    plan = parsed.data;
  } catch (error) {
    return {
      kind: "failed",
      message:
        error instanceof UserError
          ? error.message
          : "Something went wrong. Please try again.",
    };
  }
  if (plan.refusal || plan.operations.length === 0) {
    return { kind: "refused", message: plan.refusal ?? "Can't do that yet." };
  }

  let layers = base.layers;
  try {
    for (const op of plan.operations) {
      onProgress?.(PROGRESS[op.op]);
      layers = await apply(layers, op, deps.providers);
    }
    if (plan.operations.some((op) => RESHADOW.has(op.op))) {
      onProgress?.(PROGRESS.add_shadow);
      layers = { ...layers, shadow: await deps.providers.renderShadow(layers) };
    }
  } catch (error) {
    return {
      kind: "failed",
      message:
        error instanceof UserError
          ? error.message
          : "That edit failed and nothing was changed. It didn't use up a prompt.",
    };
  }

  try {
    return {
      kind: "done",
      version: await deps.store.append(projectId, layers, prompt),
    };
  } catch {
    return {
      kind: "failed",
      message: "Could not save the edit. No prompt was charged.",
    };
  }
}
