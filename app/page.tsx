import Link from "next/link";
import { Suspense } from "react";
import { auth } from "@/auth";
import { signInWithGoogle, signOutUser } from "@/app/actions";
import { UploadButton } from "@/app/upload-button";
import { sql, type Project } from "@/lib/db";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-4 py-12">
      <header className="text-center">
        <h1 className="text-3xl font-semibold">Image to Image</h1>
        <p className="mt-2 text-zinc-500">Turn your photo into an ad that doesn’t look AI-generated.</p>
      </header>
      <Suspense fallback={<p className="text-center text-zinc-500">Loading…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

async function Dashboard() {
  const userId = (await auth())?.user?.id;
  if (!userId) {
    return (
      <form action={signInWithGoogle} className="text-center">
        <button className="rounded-full bg-foreground px-6 py-3 font-medium text-background">Sign in with Google</button>
      </form>
    );
  }

  const projects = (await sql`
    SELECT id, created_at FROM projects WHERE user_id = ${userId} ORDER BY created_at DESC`) as Project[];

  return (
    <>
      <UploadButton userId={userId} />
      {projects.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- private, auth-gated image route */}
                <img src={`/projects/${p.id}/image`} alt="Project" className="aspect-square w-full rounded-lg object-cover" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      <form action={signOutUser} className="text-center">
        <button className="text-sm text-zinc-500 underline">Sign out</button>
      </form>
    </>
  );
}
