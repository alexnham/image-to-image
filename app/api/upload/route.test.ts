import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), handleUpload: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload }));
import { POST } from "./route";
import { MAX_UPLOAD_BYTES, STORED_TYPES } from "@/lib/image";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-server-only-token");
});
afterEach(() => vi.unstubAllEnvs());
const request = () => new Request("http://localhost/api/upload", {
  method: "POST", body: JSON.stringify({ type: "blob.generate-client-token" }),
});

it.each(["", "  "])("reports unavailable storage without attempting an upload", async (token) => {
  vi.stubEnv("BLOB_READ_WRITE_TOKEN", token);
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect((await response.json()).error).toMatch(/configure image storage/);
  expect(mocks.handleUpload).not.toHaveBeenCalled();
});

it("issues upload permissions only for the signed-in user's image paths", async () => {
  mocks.auth.mockResolvedValue({ user: { id: "local-preview" } });
  mocks.handleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => {
    expect(await onBeforeGenerateToken("local-preview/upload.jpg")).toEqual({
      allowedContentTypes: STORED_TYPES, maximumSizeInBytes: MAX_UPLOAD_BYTES, addRandomSuffix: true,
    });
    await expect(onBeforeGenerateToken("another-user/upload.jpg")).rejects.toThrow("Invalid path");
    return { type: "blob.generate-client-token", clientToken: "short-lived-token" };
  });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.text()).not.toContain("test-server-only-token");
});

it("refuses an anonymous upload even when storage is configured", async () => {
  mocks.auth.mockResolvedValue(null);
  mocks.handleUpload.mockImplementation(async ({ onBeforeGenerateToken }) => {
    await onBeforeGenerateToken("local-preview/upload.jpg");
  });
  const response = await POST(request());
  expect(response.status).toBe(400);
  expect((await response.json()).error).toBe("Not signed in");
});
