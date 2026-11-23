/** Keep database Date objects out of HTML attributes and use a stable time zone. */
export function formatProjectDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return {
    dateTime: date.toISOString(),
    label: date.toLocaleDateString("en-CA", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
  };
}
