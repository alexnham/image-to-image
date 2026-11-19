import { describe, expect, it, vi } from "vitest";
import { runPrompt, type Layers, type Providers, type Version, type VersionStore } from "./engine";
import type { Operation } from "./operations";

const START: Layers = {
  background: "bg-0",
  subject: { original: "subject-original", image: "subject-original", matte: "matte", x: 0.5, y: 0.5, scale: 1, flipped: false },
  shadow: null,
  texts: [],
  adjust: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, grain: 0 },
};

function memoryStore(): VersionStore & { versions: Version[] } {
  const versions: Version[] = [{ projectId: "p", number: 0, layers: START, prompt: null }];
  return {
    versions,
    async get(projectId, number) {
      const own = versions.filter((v) => v.projectId === projectId);
      return (number === undefined ? own.at(-1) : own.find((v) => v.number === number)) ?? null;
    },
    async append(projectId, layers, prompt) {
      const v = { projectId, number: versions.length, layers, prompt };
      versions.push(v);
      return v;
    },
  };
}

function fakeProviders(): Providers {
  let n = 0;
  return {
    replaceBackground: vi.fn(async (_l, scene: string) => `bg:${scene}`),
    relight: vi.fn(async () => `subject-lit-${++n}`),
    renderShadow: vi.fn(async () => `shadow-${++n}`),
    removeObject: vi.fn(async (image: string) => `${image}+erased`),
  };
}

const plannerReturning = (plan: unknown) => ({ plan: vi.fn(async () => plan) });
const run = (plan: unknown, opts: { store?: ReturnType<typeof memoryStore>; providers?: Providers; fromVersion?: number } = {}) => {
  const store = opts.store ?? memoryStore();
  const providers = opts.providers ?? fakeProviders();
  return { store, providers, result: runPrompt({ planner: plannerReturning(plan), providers, store }, { projectId: "p", prompt: "make it nice", fromVersion: opts.fromVersion }) };
};

const EVERY_OP: Operation[] = [
  { op: "replace_background", scene: "café table, morning light" },
  { op: "relight", direction: "left", warmth: 0.3, softness: 0.5 },
  { op: "add_text", text: "50% off", x: 0.5, y: 0.1 },
  { op: "move_subject", dx: -0.1, dy: 0 },
  { op: "scale_subject", factor: 1.2 },
  { op: "remove_object", region: { x: 0.1, y: 0.1, w: 0.2, h: 0.2 } },
  { op: "adjust", warmth: 0.2, grain: 0.3 },
  { op: "add_shadow" },
];

describe("runPrompt", () => {
  it("runs the plan and saves it as a new latest version", async () => {
    const { store, result } = run({ operations: [{ op: "replace_background", scene: "beach at sunset" }] });
    const r = await result;
    expect(r.kind).toBe("done");
    expect(store.versions).toHaveLength(2);
    expect(store.versions[1]).toMatchObject({ number: 1, prompt: "make it nice", layers: { background: "bg:beach at sunset" } });
  });

  it("never replaces the original subject pixels, whatever the steps", async () => {
    const { store, result } = run({ operations: EVERY_OP });
    expect((await result).kind).toBe("done");
    const subject = store.versions[1].layers.subject;
    expect(subject.original).toBe("subject-original");
    expect(subject.matte).toBe("matte");
    expect(subject.lighting).toEqual({direction:"left",warmth:0.3,softness:0.5});
  });

  it("saves nothing when a step fails", async () => {
    const providers = fakeProviders();
    providers.relight = vi.fn(async () => {
      throw new Error("provider down");
    });
    const { store, result } = run({ operations: EVERY_OP }, { providers });
    const r = await result;
    expect(r.kind).toBe("failed");
    expect(store.versions).toHaveLength(1);
  });

  it("refuses requests outside the operation list without saving", async () => {
    const { store, result } = run({ operations: [], refusal: "Can't change the product's color yet." });
    expect(await result).toEqual({ kind: "refused", message: "Can't change the product's color yet." });
    expect(store.versions).toHaveLength(1);
  });

  it("rejects planner output that isn't a valid plan", async () => {
    for (const bad of [{ operations: [{ op: "recolor_product", color: "red" }] }, { operations: [{ op: "move_subject", dx: 9, dy: 0 }] }, "not json"]) {
      const { store, result } = run(bad);
      expect((await result).kind).toBe("failed");
      expect(store.versions).toHaveLength(1);
    }
  });

  it("redraws the shadow once after background or position changes", async () => {
    const { providers, store, result } = run({ operations: [{ op: "replace_background", scene: "x" }, { op: "move_subject", dx: 0.1, dy: 0 }] });
    await result;
    expect(providers.renderShadow).toHaveBeenCalledTimes(1);
    expect(store.versions[1].layers.shadow).toMatch(/^shadow-/);
  });

  it("leaves the shadow alone for text-only edits", async () => {
    const { providers, result } = run({ operations: [{ op: "add_text", text: "Fresh daily", x: 0.5, y: 0.9 }] });
    await result;
    expect(providers.renderShadow).not.toHaveBeenCalled();
  });

  it("editing from an old version appends a new latest version built on the old one", async () => {
    const store = memoryStore();
    await run({ operations: [{ op: "replace_background", scene: "beach" }] }, { store }).result;
    await run({ operations: [{ op: "add_text", text: "Sale", x: 0.5, y: 0.1 }] }, { store, fromVersion: 0 }).result;
    expect(store.versions.map((v) => v.number)).toEqual([0, 1, 2]);
    expect(store.versions[2].layers.background).toBe("bg-0");
    expect(store.versions[2].layers.texts[0].text).toBe("Sale");
  });

  it("reports progress for each step", async () => {
    const labels: string[] = [];
    const store = memoryStore();
    await runPrompt(
      { planner: plannerReturning({ operations: [{ op: "replace_background", scene: "x" }, { op: "relight", direction: "top", warmth: 0, softness: 0.5 }] }), providers: fakeProviders(), store },
      { projectId: "p", prompt: "x", onProgress: (l) => labels.push(l) },
    );
    expect(labels).toEqual(["Replacing background…", "Matching light…", "Adding shadow…"]);
  });

  it("fails cleanly when editing a text layer that doesn't exist", async () => {
    const { store, result } = run({ operations: [{ op: "set_text", id: "nope", text: "x" }] });
    expect((await result).kind).toBe("failed");
    expect(store.versions).toHaveLength(1);
  });
});
