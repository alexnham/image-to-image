import { sql } from "@/lib/db";
import { UserError } from "../errors";
export const DEFAULT_CAP_USD = 10;
export async function reserve(kind: string, micros: number) {
  const month = new Date().toISOString().slice(0, 7);
  const cap = Math.floor(
    Number(process.env.MONTHLY_API_CAP_USD ?? DEFAULT_CAP_USD) * 1_000_000,
  );
  if (!Number.isFinite(cap) || cap < 0)
    throw new UserError(
      "Paid edits are at capacity. Manual edits and export still work.",
      503,
    );
  await sql`INSERT INTO monthly_budget(month) VALUES(${month}) ON CONFLICT DO NOTHING`;
  const [call] = await sql`WITH reserved AS (
    UPDATE monthly_budget SET spent_micros=spent_micros+${micros}
    WHERE month=${month} AND spent_micros+${micros}<=${cap} RETURNING month
  ) INSERT INTO provider_calls(month,kind,reserved_micros) SELECT month,${kind},${micros} FROM reserved RETURNING id`;
  if (!call) {
    await alertOperator(month);
    throw new UserError(
      "We're at capacity. Manual edits and export still work.",
      503,
    );
  }
  return async (actualMicros?: number) => {
    // Unknown usage (timeout/billing error) keeps the entire reservation; never silently refund paid work.
    if (actualMicros === undefined || !Number.isFinite(actualMicros)) return;
    await sql`WITH settled AS (
      UPDATE provider_calls SET actual_micros=${Math.max(0, Math.ceil(actualMicros))}
      WHERE id=${call.id} AND actual_micros IS NULL RETURNING month,reserved_micros,actual_micros
    ) UPDATE monthly_budget SET spent_micros=spent_micros+settled.actual_micros-settled.reserved_micros FROM settled WHERE monthly_budget.month=settled.month`;
  };
}
async function alertOperator(month: string) {
  // Optional Resend delivery. No outbound email is sent until the operator configures a recipient.
  if (
    !process.env.RESEND_API_KEY ||
    !process.env.OPERATOR_EMAIL ||
    !process.env.ALERT_FROM_EMAIL
  )
    return;
  const [claimed] =
    await sql`UPDATE monthly_budget SET alerted=true WHERE month=${month} AND NOT alerted RETURNING month`;
  if (!claimed) return;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `budget-${month}`,
      },
      body: JSON.stringify({
        from: process.env.ALERT_FROM_EMAIL,
        to: process.env.OPERATOR_EMAIL,
        subject: "Image to Image API budget reached",
        text: `Paid actions are paused for ${month}. Manual editing and exports remain available.`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("Alert delivery failed");
  } catch {
    await sql`UPDATE monthly_budget SET alerted=false WHERE month=${month}`;
  }
}
