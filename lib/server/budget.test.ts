import { beforeEach, describe, it, expect, vi } from "vitest";
const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));
vi.mock("@/lib/db", () => ({ sql }));
import { reserve } from "./budget";
beforeEach(() => {
  sql.mockReset();
  vi.stubEnv("MONTHLY_API_CAP_USD", "10");
  vi.stubEnv("RESEND_API_KEY", "");
});
describe("monthly cost guard", () => {
  it("refuses before calling any paid API when atomic reservation fails", async () => {
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(reserve("image-edit", 2e6)).rejects.toThrow("capacity");
    expect(sql).toHaveBeenCalledTimes(2);
    expect(sql.mock.calls[1][0].join("")).toContain("spent_micros+");
  });
  it("settles a reservation only once in SQL and leaves unknown costs charged", async () => {
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "call" }])
      .mockResolvedValue([]);
    const settle = await reserve("image-edit", 2e6);
    await settle();
    expect(sql).toHaveBeenCalledTimes(2);
    await settle(1234.5);
    expect(sql.mock.calls[2][0].join("")).toContain("actual_micros IS NULL");
    expect(sql.mock.calls[2]).toContain(1235);
  });
  it("fails closed for invalid operator configuration", async () => {
    vi.stubEnv("MONTHLY_API_CAP_USD", "invalid");
    await expect(reserve("image-edit", 2e6)).rejects.toThrow("capacity");
    expect(sql).not.toHaveBeenCalled();
  });
});

it("emails the configured operator once when a monthly cap blocks work", async () => {
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("OPERATOR_EMAIL", "operator@example.test");
  vi.stubEnv("ALERT_FROM_EMAIL", "alerts@example.test");
  sql
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ month: "2026-11" }]);
  const fetcher = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetcher);
  await expect(reserve("image-edit", 2e6)).rejects.toThrow("capacity");
  expect(fetcher).toHaveBeenCalledWith(
    "https://api.resend.com/emails",
    expect.objectContaining({
      body: expect.stringContaining("operator@example.test"),
    }),
  );
  expect(sql.mock.calls[2][0].join("")).toContain("AND NOT alerted");
});
