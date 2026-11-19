import { beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import type { Layers } from "../engine/engine";
const f = vi.hoisted(() => ({
  files: new Map<string, Buffer>(),
  latest: vi.fn(),
  detectText: vi.fn(),
  append: vi.fn(),
  openai: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ sql: vi.fn(async () => []) }));
vi.mock("./access", async () => {
  const { UserError } = await import("../errors");
  return {
    UserError,
    owner: vi.fn(async () => ({
      userId: "user",
      project: { image_pathname: "user/source.png" },
    })),
    lock: vi.fn(async () => ({ token: "lock", used: 0 })),
    unlock: vi.fn(),
    errorResponse: (e: Error) =>
      Response.json({ error: e.message }, { status: 500 }),
  };
});
vi.mock("./versions", () => ({
  latest: f.latest,
  versionStore: () => ({ append: f.append }),
}));
vi.mock("./planner", () => ({ detectText: f.detectText }));
vi.mock("./openai", () => ({ IMAGE_MODEL: "test", openai: f.openai }));
vi.mock("./assets", async () => {
  const s = (await import("sharp")).default;
  return {
    readImage: async (p: string) => {
      const b = f.files.get(p);
      if (!b) throw new Error(`Missing fixture ${p}`);
      return b;
    },
    saveImage: async (_p: string, _u: string, b: Buffer) => {
      const id = `user/p/asset-${f.files.size}.png`;
      f.files.set(id, b);
      return id;
    },
    decode: async (b: Buffer) => {
      const r = await s(b)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return {
        width: r.info.width,
        height: r.info.height,
        data: new Uint8ClampedArray(r.data),
      };
    },
    png: async (r: {
      width: number;
      height: number;
      data: Uint8ClampedArray;
    }) =>
      s(Buffer.from(r.data), {
        raw: { width: r.width, height: r.height, channels: 4 },
      })
        .png()
        .toBuffer(),
  };
});
vi.mock("@/lib/relight", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../relight")>();
  return {
    ...actual,
    transferBrightness: vi.fn(actual.transferBrightness),
    transferLight: vi.fn(actual.transferLight),
  };
});
import { transferBrightness, transferLight } from "../relight";
import { POST as prepare } from "@/app/api/projects/[id]/prepare/route";
import { POST as swap } from "@/app/api/projects/[id]/swap/route";
import { providers } from "./providers";
import { decode } from "./assets";
function bounds(data: Uint8ClampedArray, width: number, height: number) {
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 128) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}
const context = { params: Promise.resolve({ id: "p" }) };
const request = (body: object) =>
  new Request("http://localhost", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
beforeEach(async () => {
  f.files.clear();
  f.latest.mockReset().mockResolvedValue(null);
  f.append
    .mockReset()
    .mockImplementation(async (_id, layers, prompt) => ({
      projectId: "p",
      number: 0,
      layers,
      prompt,
    }));
  f.detectText.mockReset().mockResolvedValue([]);
  vi.mocked(transferBrightness).mockClear();
  vi.mocked(transferLight).mockClear();
  const source = await sharp({
    create: { width: 200, height: 100, channels: 4, background: "#112233" },
  })
    .png()
    .toBuffer();
  f.files.set("user/source.png", source);
  const oldMask = await sharp(
    Buffer.from(
      '<svg width="200" height="100"><rect width="200" height="100" fill="black"/><rect x="80" y="30" width="40" height="40" fill="white"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  f.files.set("user/p/mask.png", oldMask);
  const cutout = await sharp(
    Buffer.from(
      '<svg width="200" height="100"><rect x="80" y="30" width="40" height="40" fill="#112233"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  f.files.set("old-subject", cutout);
  const edited = await sharp({
    create: { width: 200, height: 100, channels: 4, background: "#ff00ff" },
  })
    .png()
    .toBuffer();
  f.openai
    .mockReset()
    .mockResolvedValue({ data: [{ b64_json: edited.toString("base64") }] });
});
const base = (): Layers => ({
  background: "user/source.png",
  subject: {
    original: "old-subject",
    image: "old-subject",
    matte: "user/p/mask.png",
    x: 0.6,
    y: 0.4,
    scale: 0.8,
    flipped: true,
    lighting: { direction: "left", warmth: 0, softness: 0.4 },
  },
  texts: [],
  shadow: null,
  adjust: { brightness: 0, contrast: 0, saturation: 0, warmth: 0, grain: 0 },
});
it("preparation preserves source pixels outside product/shadow/overlay cleanup regions", async () => {
  f.detectText.mockResolvedValue([
    {
      text: "Sale",
      overlay: true,
      x: 0.05,
      y: 0.05,
      w: 0.1,
      h: 0.1,
      color: "#ffffff",
    },
    {
      text: "Shop",
      overlay: false,
      x: 0.75,
      y: 0.2,
      w: 0.1,
      h: 0.1,
      color: "#ffffff",
    },
  ]);
  const response = await prepare(
    request({ maskPath: "user/p/mask.png" }),
    context,
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const result = await response.json();
  const output = await decode(f.files.get(result.version.layers.background)!);
  const pixel = (x: number, y: number) => [
    ...output.data.slice((y * 200 + x) * 4, (y * 200 + x) * 4 + 4),
  ];
  expect(pixel(190, 0)).toEqual([17, 34, 51, 255]);
  expect(pixel(155, 25)).toEqual([17, 34, 51, 255]);
  expect(pixel(15, 8)).toEqual([255, 0, 255, 255]);
  expect(result.version.layers.texts[0].text).toBe("Sale");
});
it("swaps differently framed photos into old product bounds and reapplies saved lighting", async () => {
  f.latest.mockResolvedValue({
    projectId: "p",
    number: 0,
    layers: base(),
    prompt: null,
  });
  const image = await sharp(
    Buffer.from(
      '<svg width="200" height="100"><rect x="10" y="10" width="20" height="20" fill="#224466"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  f.files.set("user/p/new.png", image);
  const mask = await sharp(
    Buffer.from(
      '<svg width="200" height="100"><rect width="200" height="100" fill="black"/><rect x="10" y="10" width="20" height="20" fill="white"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  f.files.set("user/p/new-mask.png", mask);
  const response = await swap(
    request({
      fromVersion: 0,
      imagePath: "user/p/new.png",
      maskPath: "user/p/new-mask.png",
    }),
    context,
  );
  expect(response.status, await response.clone().text()).toBe(200);
  const result = await response.json();
  const replacement = await decode(
    f.files.get(result.version.layers.subject.original)!,
  );
  expect(bounds(replacement.data, 200, 100)).toEqual({
    left: 80,
    top: 30,
    width: 40,
    height: 40,
  });
  expect(result.version.layers.subject).toMatchObject({
    x: 0.6,
    y: 0.4,
    scale: 0.8,
    flipped: true,
    lighting: { direction: "left" },
  });
  expect(result.version.layers.subject.image).not.toBe(
    result.version.layers.subject.original,
  );
  expect(transferBrightness).toHaveBeenCalled();
});
it("uses the selected bounded luminance method for relighting", async () => {
  await providers("p", "user").relight(base(), {
    direction: "left",
    warmth: 1,
    softness: 0.2,
  });
  expect(transferBrightness).toHaveBeenCalledOnce();
  expect(transferLight).not.toHaveBeenCalled();
});
