import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUserId } from "@/auth";
import { sql } from "@/lib/db";
import type { Version } from "@/lib/engine/engine";
import { Editor } from "./editor";
export default function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  return (
    <main className="editor-page">
      <nav className="app-nav">
        <Link className="wordmark" href="/">
          image / image
        </Link>
        <Link href="/">All projects</Link>
      </nav>
      <Suspense fallback={<p className="loading">Opening your workspace…</p>}>
        <Project params={params} />
      </Suspense>
    </main>
  );
}
async function Project({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(id))
    notFound();
  const [project] =
    await sql`SELECT id FROM projects WHERE id=${id} AND user_id=${userId}`;
  if (!project) notFound();
  const rows =
    await sql`SELECT number,layers,prompt FROM versions WHERE project_id=${id} ORDER BY number DESC`;
  const [account] =
    await sql`SELECT prompts_used FROM accounts WHERE user_id=${userId}`;
  const versions = rows.map((v) => ({
    projectId: id,
    number: v.number,
    layers: v.layers,
    prompt: v.prompt,
  })) as Version[];
  return (
    <Editor
      id={id}
      userId={userId}
      initialVersions={versions}
      remaining={20 - Number(account?.prompts_used ?? 0)}
    />
  );
}
