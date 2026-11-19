import { beforeEach, describe, expect, it, vi } from "vitest";
const { reserve, settle } = vi.hoisted(() => ({
  reserve: vi.fn(),
  settle: vi.fn(),
}));
vi.mock("./budget", () => ({ reserve }));
import { openai, usageMicros } from "./openai";
beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "test-only");
  reserve.mockReset().mockResolvedValue(settle);
  settle.mockReset();
});
describe("metered provider boundary", () => {
  it("reserves before inference and reconciles actual usage", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            usage: { input_tokens: 100, output_tokens: 20 },
            output: [],
          }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    await openai("responses", {});
    expect(reserve).toHaveBeenCalledWith("vision-planner", 100000);
    expect(reserve.mock.invocationCallOrder[0]).toBeLessThan(
      fetcher.mock.invocationCallOrder[0],
    );
    expect(settle).toHaveBeenCalledWith(165);
  });
  it.each([400, 401, 403, 404, 429])(
    "handles rejection %i without retaining a reservation",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("{}", { status })),
      );
      await expect(openai("responses", {})).rejects.toThrow();
      expect(settle).toHaveBeenCalledWith(0);
    },
  );
  it("keeps the conservative reservation when a timed out request may have been billed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new DOMException("Timeout", "TimeoutError");
      }),
    );
    await expect(openai("responses", {})).rejects.toThrow("timed out");
    expect(settle).not.toHaveBeenCalled();
  });
  it("never calls a provider when monthly cap refuses the reservation", async () => {
    reserve.mockRejectedValueOnce(new Error("at capacity"));
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(openai("responses", {})).rejects.toThrow("capacity");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses full input and output image cost, and keeps unknown usage reserved", () => {
    expect(
      usageMicros(
        {
          input_tokens: 120,
          output_tokens: 10,
          input_tokens_details: { text_tokens: 20, image_tokens: 100 },
        },
        true,
      ),
    ).toBe(1200);
    expect(
      usageMicros({ input_tokens: 120, output_tokens: 10 }, true),
    ).toBeUndefined();
  });
});
