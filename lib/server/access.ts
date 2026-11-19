import { ZodError } from "zod";
import { auth } from "@/auth";
import { sql } from "@/lib/db";
import { UserError } from "@/lib/errors";
export { UserError } from "@/lib/errors";
export async function owner(id: string) {
  const userId = (await auth())?.user?.id;
  if (!userId) throw new UserError("Please sign in.", 401);
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))
    throw new UserError("Project not found.", 404);
  const [project] =
    await sql`SELECT * FROM projects WHERE id=${id} AND user_id=${userId}`;
  if (!project) throw new UserError("Project not found.", 404);
  return { userId, project };
}
export function errorResponse(error: unknown) {
  if (error instanceof ZodError)
    return Response.json(
      {
        error:
          "That edit contains invalid values. Check your input and try again.",
      },
      { status: 400 },
    );
  if (error instanceof UserError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error(
    "Request failed:",
    error instanceof Error ? error.name : "Unknown error",
  );
  return Response.json(
    { error: "That didn't finish. Please try again; no prompt was charged." },
    { status: 500 },
  );
}
export async function lock(userId: string) {
  await sql`INSERT INTO accounts(user_id) VALUES(${userId}) ON CONFLICT DO NOTHING`;
  const token = crypto.randomUUID();
  const rows =
    await sql`UPDATE accounts SET lock_token=${token}, locked_until=now()+interval '10 minutes', last_seen=now()
    WHERE user_id=${userId} AND (locked_until IS NULL OR locked_until<now()) RETURNING prompts_used`;
  if (!rows.length)
    throw new UserError(
      "An edit is already running. Wait for it to finish.",
      409,
    );
  return { token, used: Number(rows[0].prompts_used) };
}
export async function unlock(userId: string, token: string) {
  await sql`UPDATE accounts SET lock_token=NULL, locked_until=NULL WHERE user_id=${userId} AND lock_token=${token}`;
}
