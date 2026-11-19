import { sql } from "@/lib/db";
import type { Layers, Version, VersionStore } from "@/lib/engine/engine";
export async function latest(
  projectId: string,
  number?: number,
): Promise<Version | null> {
  const rows =
    number === undefined
      ? await sql`SELECT * FROM versions WHERE project_id=${projectId} ORDER BY number DESC LIMIT 1`
      : await sql`SELECT * FROM versions WHERE project_id=${projectId} AND number=${number}`;
  const row = rows[0];
  return row
    ? {
        projectId,
        number: row.number,
        layers: row.layers as Layers,
        prompt: row.prompt,
      }
    : null;
}
export function versionStore(
  userId: string,
  token: string,
  charge: boolean,
): VersionStore {
  return {
    get: latest,
    async append(projectId, layers, prompt) {
      // The account lock serializes all writes. Charge and version are committed together.
      const rows = await sql`WITH charged AS (
        UPDATE accounts SET prompts_used=prompts_used+${charge ? 1 : 0}
        WHERE user_id=${userId} AND lock_token=${token} AND locked_until>now() AND (${!charge} OR prompts_used<20) AND EXISTS(SELECT 1 FROM projects WHERE id=${projectId} AND user_id=${userId})
        RETURNING user_id
      ) INSERT INTO versions(project_id,number,layers,prompt)
      SELECT ${projectId}, COALESCE((SELECT MAX(number)+1 FROM versions WHERE project_id=${projectId}),0), ${JSON.stringify(layers)}::jsonb, ${prompt}
      FROM charged WHERE EXISTS(SELECT 1 FROM projects WHERE id=${projectId} AND user_id=${userId})
      RETURNING number`;
      if (!rows.length) throw new Error("Edit lock expired");
      return { projectId, number: rows[0].number, layers, prompt };
    },
  };
}
