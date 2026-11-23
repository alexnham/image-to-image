import { beforeEach, expect, it, vi } from "vitest";
import sharp from "sharp";
import { UserError } from "@/lib/errors";

const mocks = vi.hoisted(() => ({ owner: vi.fn(), latest: vi.fn(), render: vi.fn() }));
vi.mock("@/lib/server/access", async () => ({
  owner: mocks.owner,
  UserError: (await import("@/lib/errors")).UserError,
  errorResponse(error: unknown) {
    if (error instanceof UserError)
      return Response.json({ error: error.message }, { status: error.status });
    return Response.json({ error: "Preview unavailable" }, { status: 500 });
  },
}));
vi.mock("@/lib/server/versions", () => ({ latest: mocks.latest }));
vi.mock("@/lib/server/render", () => ({ render: mocks.render }));
import { GET } from "./route";

const context = { params: Promise.resolve({ id: "project" }) };
const request = (query = "?version=2") => new Request(`http://localhost/api/projects/project/thumbnail${query}`);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.owner.mockResolvedValue({ userId: "owner" });
});

it("renders the requested saved version as a small private preview", async () => {
  const layers = { crop: "portrait", rotation: 90, texts: [{ text: "Sale" }] };
  mocks.latest.mockResolvedValue({ number: 2, layers });
  mocks.render.mockResolvedValue(await sharp({ create: {
    width: 800, height: 1000, channels: 4, background: "#123456",
  } }).png().toBuffer());
  const response = await GET(request(), context);
  expect(response.status).toBe(200);
  expect(mocks.latest).toHaveBeenCalledWith("project", 2);
  expect(mocks.render).toHaveBeenCalledWith(layers);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect(response.headers.get("Content-Type")).toBe("image/png");
  expect(response.headers.get("Content-Disposition")).toBeNull();
  const meta = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
  expect(meta).toMatchObject({ width: 128, height: 160, format: "png" });
});

it("does not enlarge small versions and accepts version zero", async () => {
  mocks.latest.mockResolvedValue({ layers: {} });
  mocks.render.mockResolvedValue(await sharp({ create: {
    width: 40, height: 20, channels: 4, background: "white",
  } }).png().toBuffer());
  const response = await GET(request("?version=0"), context);
  expect(mocks.latest).toHaveBeenCalledWith("project", 0);
  expect(await sharp(Buffer.from(await response.arrayBuffer())).metadata()).toMatchObject({ width: 40, height: 20 });
});

it.each([401, 404])("checks ownership before reading any saved image (%i)", async (status) => {
  mocks.owner.mockRejectedValue(new UserError("Not allowed", status));
  expect((await GET(request(), context)).status).toBe(status);
  expect(mocks.latest).not.toHaveBeenCalled();
  expect(mocks.render).not.toHaveBeenCalled();
});

it.each(["", "?version=", "?version=-1", "?version=0.5", "?version=NaN", "?version=Infinity", "?version=9007199254740992"])("rejects an invalid or missing version: %s", async (query) => {
  expect((await GET(request(query), context)).status).toBe(400);
  expect(mocks.latest).not.toHaveBeenCalled();
  expect(mocks.render).not.toHaveBeenCalled();
});

it("returns a missing-version error without rendering", async () => {
  mocks.latest.mockResolvedValue(null);
  expect((await GET(request(), context)).status).toBe(404);
  expect(mocks.render).not.toHaveBeenCalled();
});

it("handles a missing storage asset without returning an image", async () => {
  mocks.latest.mockResolvedValue({ layers: {} });
  mocks.render.mockRejectedValue(new Error("Missing asset"));
  const response = await GET(request(), context);
  expect(response.status).toBe(500);
  expect(response.headers.get("Content-Type")).toContain("application/json");
});
