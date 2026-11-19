import env from "@next/env";
import { neon } from "@neondatabase/serverless";
env.loadEnvConfig(process.cwd());
const sql = neon(process.env.DATABASE_URL);
const [metrics] = await sql`SELECT
 (SELECT count(*) FROM accounts WHERE user_id<>'local-preview') AS signups,
 (SELECT count(DISTINCT user_id) FROM events WHERE name='export' AND user_id<>'local-preview') AS exporters,
 (SELECT count(*) FROM accounts WHERE first_seen<now()-interval '14 days' AND user_id<>'local-preview') AS week_two_eligible,
 (SELECT count(*) FROM accounts a WHERE first_seen<now()-interval '14 days' AND user_id<>'local-preview'
 AND EXISTS(SELECT 1 FROM events e WHERE e.user_id=a.user_id AND e.name='visit' AND e.created_at>=a.first_seen+interval '7 days' AND e.created_at<a.first_seen+interval '14 days')) AS week_two_returned`;
console.log(metrics);
const signups = Number(metrics.signups),
  eligible = Number(metrics.week_two_eligible);
console.log({
  export_rate: signups ? Number(metrics.exporters) / signups : null,
  week_two_return_rate: eligible
    ? Number(metrics.week_two_returned) / eligible
    : null,
});
