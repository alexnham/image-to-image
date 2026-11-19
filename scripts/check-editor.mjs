import env from "@next/env";
import { neon } from "@neondatabase/serverless";
import { put, get } from "@vercel/blob";
import { encode } from "@auth/core/jwt";
import sharp from "sharp";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
env.loadEnvConfig(process.cwd());
if (!process.argv.includes("--live"))
  throw new Error("Pass --live to run metered checks");
const sql = neon(process.env.DATABASE_URL),
  base = "http://127.0.0.1:3000",
  userId = "local-preview";
const { id } = JSON.parse(
  await fs.readFile("artifacts/smoke-project.json", "utf8"),
);
const token = await encode({
  token: { sub: userId },
  secret: process.env.AUTH_SECRET,
  salt: "authjs.session-token",
});
const headers = {
  Cookie: `authjs.session-token=${token}`,
  "Content-Type": "application/json",
  Origin: base,
};
async function post(path, body) {
  const start = Date.now();
  const r = await fetch(`${base}/api/projects/${id}/${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  assert.equal(r.status, 200, text);
  console.log(path, `${((Date.now() - start) / 1000).toFixed(1)}s`);
  return path === "edit"
    ? text.trim().split("\n").map(JSON.parse)
    : JSON.parse(text);
}
async function read(path) {
  const r = await get(path, { access: "private" });
  return Buffer.from(await new Response(r.stream).arrayBuffer());
}
const [before] =
  await sql`SELECT prompts_used FROM accounts WHERE user_id=${userId}`;
const used = Number(before.prompts_used);
const variants = await post("edit", {
  fromVersion: 1,
  prompt:
    'Add a small headline that says "Weekend special" in dark blue at the top.',
  variations: 2,
});
const versions = variants.filter((e) => e.type === "version");
assert.equal(versions.length, 2, JSON.stringify(variants));
assert.equal(versions[1].remaining, 18 - used);
const detected = await post("text", { fromVersion: 0 });
assert.ok(Array.isArray(detected.boxes));
assert.ok(
  detected.boxes.every((b) => !b.overlay),
  "Product labels must remain in-scene",
);
const [{ layers }] =
  await sql`SELECT layers FROM versions WHERE project_id=${id} AND number=0`;
const source = await read(layers.background),
  metadata = await sharp(source).metadata();
const mask = await sharp({
  create: {
    width: metadata.width,
    height: metadata.height,
    channels: 3,
    background: "black",
  },
})
  .composite([
    {
      input: Buffer.from(
        `<svg width="${metadata.width}" height="${metadata.height}"><rect x="0" y="0" width="100" height="100" fill="white"/></svg>`,
      ),
    },
  ])
  .png()
  .toBuffer();
const uploaded = await put(`${userId}/${id}/test-brush.png`, mask, {
  access: "private",
});
const removed = await post("remove", {
  fromVersion: 0,
  maskPath: uploaded.pathname,
});
assert.equal(removed.version.layers.subject.original, layers.subject.original);
const oldPixels = await sharp(source).ensureAlpha().raw().toBuffer(),
  newPixels = await sharp(await read(removed.version.layers.background))
    .ensureAlpha()
    .raw()
    .toBuffer();
for (let y = 0; y < metadata.height; y++)
  for (let x = 0; x < metadata.width; x++) {
    if (x < 100 && y < 100) continue;
    const i = (y * metadata.width + x) * 4;
    assert.deepEqual(
      newPixels.subarray(i, i + 4),
      oldPixels.subarray(i, i + 4),
    );
  }
const copied = await put(
  `${userId}/${id}/test-swap.png`,
  await read(layers.subject.original),
  { access: "private" },
);
const swapped = await post("swap", {
  fromVersion: 0,
  imagePath: copied.pathname,
  maskPath: layers.subject.matte,
});
assert.notEqual(
  swapped.version.layers.subject.original,
  layers.subject.original,
);
const [after] =
  await sql`SELECT prompts_used FROM accounts WHERE user_id=${userId}`;
assert.equal(Number(after.prompts_used), used + 2);
await sql`UPDATE accounts SET prompts_used=20 WHERE user_id=${userId}`;
try {
  const r = await fetch(`${base}/api/projects/${id}/edit`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      fromVersion: 0,
      prompt: "New background",
      variations: 1,
    }),
  });
  assert.equal(r.status, 403);
  const ex = await fetch(`${base}/api/projects/${id}/export?version=0`, {
    headers,
  });
  assert.equal(ex.status, 200);
} finally {
  await sql`UPDATE accounts SET prompts_used=${used + 2} WHERE user_id=${userId}`;
}
// Test deletion on the failed, disposable setup fixture only.
const disposable = await put(
  `${userId}/delete-check-${crypto.randomUUID()}.png`,
  await read(layers.background),
  { access: "private" },
);
const [testProject] =
  await sql`INSERT INTO projects(user_id,image_pathname) VALUES(${userId},${disposable.pathname}) RETURNING id`;
const stale = testProject.id;
const [exists] =
  await sql`SELECT id,image_pathname FROM projects WHERE id=${stale} AND user_id=${userId}`;
if (exists) {
  const r = await fetch(`${base}/api/projects/${stale}`, {
    method: "DELETE",
    headers,
    body: "{}",
  });
  assert.equal(r.status, 200, await r.text());
  assert.equal(
    (await sql`SELECT id FROM projects WHERE id=${stale}`).length,
    0,
  );
  assert.equal(
    await get(exists.image_pathname, { access: "private", useCache: false }),
    null,
  );
}
const calls =
  await sql`SELECT kind,reserved_micros,actual_micros,created_at FROM provider_calls ORDER BY created_at`;
await fs.writeFile(
  "artifacts/provider-usage.json",
  JSON.stringify(calls, null, 2),
);
console.log(
  "PASS: independent variations charge each, OCR preserves labels, brush exact region-only merge, swap, exhausted allowance, free export, permanent project/file deletion",
);
