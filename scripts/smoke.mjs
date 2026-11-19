// Explicit live test: uses the configured DB, private Blob and metered OpenAI API.
import nextEnv from "@next/env";
const { loadEnvConfig } = nextEnv;
import { neon } from "@neondatabase/serverless";
import { put } from "@vercel/blob";
import { encode } from "@auth/core/jwt";
import sharp from "sharp";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
loadEnvConfig(process.cwd());
if (!process.argv.includes("--live"))
  throw new Error("Pass --live to authorize metered API smoke tests.");
const base = "http://127.0.0.1:3000",
  sql = neon(process.env.DATABASE_URL),
  userId = "local-preview";
const [startingAccount] =
  await sql`SELECT prompts_used FROM accounts WHERE user_id=${userId}`;
const startingUsed = Number(startingAccount?.prompts_used ?? 0);
const token = await encode({
  token: { sub: userId, name: "Local preview" },
  secret: process.env.AUTH_SECRET,
  salt: "authjs.session-token",
});
const headers = {
  Cookie: `authjs.session-token=${token}`,
  "Content-Type": "application/json",
  Origin: base,
};
async function post(id, path, body) {
  const t = Date.now();
  const r = await fetch(`${base}/api/projects/${id}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const content = await r.text();
  if (!r.ok) throw new Error(`${path} HTTP ${r.status}: ${content}`);
  console.log(path, r.status, `${((Date.now() - t) / 1000).toFixed(1)}s`);
  return content;
}
await sql`INSERT INTO accounts(user_id) VALUES(${userId}) ON CONFLICT DO NOTHING`;
// A generated test chart has a fine label and deterministic product pixels to verify.
const svg = `<svg width="800" height="800"><rect width="800" height="800" fill="#ece7df"/><text x="400" y="90" font-size="44" font-family="sans-serif" text-anchor="middle" fill="#203149">WEEKEND 20% OFF</text><path d="M0 550H800V800H0Z" fill="#c4af94"/><ellipse cx="410" cy="640" rx="145" ry="25" fill="#8a7a68"/><rect x="315" y="235" width="170" height="390" rx="34" fill="#8aab7e"/><rect x="365" y="205" width="70" height="45" fill="#364339"/><rect x="315" y="350" width="170" height="160" fill="#fff6dc"/><text x="400" y="398" font-family="sans-serif" font-size="30" text-anchor="middle" fill="#294436">EVERYDAY</text><text x="400" y="435" font-family="sans-serif" font-size="22" text-anchor="middle" fill="#294436">HAND SOAP</text><text x="400" y="475" font-size="12" text-anchor="middle">250ml · original detail</text></svg>`;
const input = await sharp(Buffer.from(svg)).png().toBuffer();
const blob = await put(`${userId}/smoke-${crypto.randomUUID()}.png`, input, {
  access: "private",
});
const [project] =
  await sql`INSERT INTO projects(user_id,image_pathname) VALUES(${userId},${blob.pathname}) RETURNING id`;
const id = project.id;
console.log("Smoke project", id);
const mask = await sharp({
  create: { width: 800, height: 800, channels: 3, background: "black" },
})
  .composite([
    {
      input: Buffer.from(
        '<svg width="800" height="800"><rect x="315" y="205" width="170" height="420" rx="20" fill="white"/></svg>',
      ),
    },
  ])
  .png()
  .toBuffer();
const maskBlob = await put(`${userId}/${id}/smoke-mask.png`, mask, {
  access: "private",
});
try {
  const prepared = JSON.parse(
    await post(id, "prepare", { maskPath: maskBlob.pathname }),
  );
  assert.equal(prepared.version.number, 0);
  assert.ok(
    prepared.version.layers.texts.some((t) => t.text.includes("20%")),
    "Upload should lift the promotional headline into editable type",
  );
  assert.ok(
    prepared.version.layers.texts.every((t) => !t.text.includes("EVERYDAY")),
    "Physical product labels must stay in the cutout",
  );
  const edit = await post(id, "edit", {
    prompt:
      'Put it on a sunlit kitchen counter with a calm pale blue wall. Add headline "Good things, daily" in dark blue at the top.',
    fromVersion: 0,
    variations: 1,
  });
  const events = edit.trim().split("\n").map(JSON.parse);
  const result = events.find((e) => e.type === "version");
  assert.ok(result, JSON.stringify(events));
  assert.equal(
    result.version.layers.subject.original,
    prepared.version.layers.subject.original,
  );
  assert.equal(result.remaining, 19 - startingUsed);
  const manual = {
    texts: result.version.layers.texts,
    transform: { x: 0.5, y: 0.5, scale: 1, flipped: false },
    adjust: result.version.layers.adjust,
    crop: "portrait",
    rotation: 0,
  };
  const saved = JSON.parse(
    await post(id, "versions", { fromVersion: 0, manual }),
  );
  assert.equal(saved.version.number, 2);
  assert.equal(
    saved.version.layers.background,
    prepared.version.layers.background,
  );
  const r = await fetch(`${base}/api/projects/${id}/export?version=2`, {
    headers,
  });
  assert.equal(r.status, 200);
  const exported = Buffer.from(await r.arrayBuffer());
  const metadata = await sharp(exported).metadata();
  assert.equal(metadata.width / metadata.height, 0.8);
  await fs.mkdir("artifacts", { recursive: true });
  await fs.writeFile("artifacts/smoke-export.png", exported);
  const denied = await fetch(`${base}/api/projects/${id}/versions`);
  assert.equal(denied.status, 401);
  const cross = await fetch(`${base}/api/projects/${id}/versions`, {
    method: "POST",
    headers: { ...headers, Origin: "https://evil.example" },
    body: "{}",
  });
  assert.equal(cross.status, 403);
  const refusal = await post(id, "edit", {
    prompt: "Turn the product into a purple dragon with wings.",
    fromVersion: 0,
    variations: 1,
  });
  assert.ok(refusal.includes("error"));
  const [acct] =
    await sql`SELECT prompts_used FROM accounts WHERE user_id=${userId}`;
  assert.equal(acct.prompts_used, startingUsed + 1);
  console.log(
    "PASS: prepare, AI background + text, protected original, old-version append, PNG 4:5, ownership, origin, refusal/no charge",
  );
  console.log("Preview", `${base}/projects/${id}`);
  await fs.writeFile(
    "artifacts/smoke-project.json",
    JSON.stringify({ id, userId }, null, 2),
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
  // Preserve the test project for diagnosis; Delete project in the app removes it.
}
