import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireUserId } from "@/auth";
import { sql } from "@/lib/db";
import { ExportButton } from "./export-button";

export default function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
      <Link href="/" className="text-sm text-zinc-500">← All projects</Link>
      <Suspense fallback={<p className="text-zinc-500">Loading…</p>}>
        <Project params={params} />
      </Suspense>
    </main>
  );
}

async function Project({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const [project] = await sql`SELECT id FROM projects WHERE id = ${id} AND user_id = ${userId}`;
  if (!project) notFound();
  const src = `/projects/${id}/image`;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated image route */}
      <img src={src} alt="Your photo" className="w-full rounded-lg" />
      <ExportButton src={src} />
    </>
  );
}
