import { neon } from "@neondatabase/serverless";

export const sql = neon(process.env.DATABASE_URL!);

export type Project = { id: string; user_id: string; image_pathname: string; created_at: string };
