import env from "@next/env";
import { neon } from "@neondatabase/serverless";
import { readFile } from "node:fs/promises";
env.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const sql = neon(process.env.DATABASE_URL);
for (const statement of (
  await readFile(new URL("../db/schema.sql", import.meta.url), "utf8")
)
  .split(";")
  .filter((s) => s.trim()))
  await sql.query(statement);
console.log("Database schema is up to date.");
