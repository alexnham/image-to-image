import { expect, it } from "vitest";
import { formatProjectDate } from "./project-date";

it("normalizes database Date objects and serialized timestamps to identical strings", () => {
  const date = new Date("2026-11-23T07:59:53-07:00");
  const result = formatProjectDate(date);
  expect(result.dateTime).toBe("2026-11-23T14:59:53.000Z");
  expect(result.label).toBe("Nov 23");
  expect(formatProjectDate(date.toISOString())).toEqual(result);
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
});

it("keeps the date consistent near midnight regardless of timestamp offset", () => {
  expect(formatProjectDate("2026-11-23T23:30:00-07:00")).toEqual({
    dateTime: "2026-11-24T06:30:00.000Z", label: "Nov 24",
  });
});
