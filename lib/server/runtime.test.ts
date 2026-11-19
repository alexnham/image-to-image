import { describe, it, expect, vi } from "vitest";
import env from "@next/env";
// Explicit database checks, skipped by the normal fixture-only test suite.
describe.skipIf(process.env.RUN_DATABASE_TESTS !== "1")(
  "live database spending guard",
  () => {
    it("serializes concurrent reservations and refuses paid work at cap", async () => {
      vi.stubEnv("NODE_ENV", "development");
      env.loadEnvConfig(process.cwd(), true);
      const { sql } = await import("../db");
      const { reserve } = await import("./budget");
      const month = new Date().toISOString().slice(0, 7);
      const [before] =
        await sql`SELECT spent_micros FROM monthly_budget WHERE month=${month}`;
      const baseline = Number(before?.spent_micros ?? 0);
      vi.stubEnv("MONTHLY_API_CAP_USD", String((baseline + 2e6) / 1e6));
      const reservations = await Promise.allSettled([
        reserve("concurrency-check", 2e6),
        reserve("concurrency-check", 2e6),
      ]);
      try {
        expect(
          reservations.filter((r) => r.status === "fulfilled"),
        ).toHaveLength(1);
        expect(
          reservations.filter((r) => r.status === "rejected"),
        ).toHaveLength(1);
      } finally {
        for (const result of reservations)
          if (result.status === "fulfilled") await result.value(0);
      }
      vi.stubEnv("MONTHLY_API_CAP_USD", "0");
      const { openai } = await import("./openai");
      await expect(openai("responses", {})).rejects.toThrow("capacity");
      const [after] =
        await sql`SELECT spent_micros FROM monthly_budget WHERE month=${month}`;
      expect(Number(after.spent_micros)).toBe(baseline);
      vi.unstubAllEnvs();
    }, 15000);
  },
);
