"use server";

import { head } from "@vercel/blob";
import { redirect } from "next/navigation";
import { requireUserId, signIn, signOut } from "@/auth";
import { sql } from "@/lib/db";

export async function signInWithGoogle() {
  await signIn("google");
}

export async function signOutUser() {
  await signOut({ redirectTo: "/" });
}

export async function createProject(pathname: string) {
  const userId = await requireUserId();
  // The client tells us where it uploaded; only accept the user's own, existing blob.
  if (!pathname.startsWith(`${userId}/`)) throw new Error("Invalid path");
  await head(pathname);
  const [project] = await sql`
    INSERT INTO projects (user_id, image_pathname) VALUES (${userId}, ${pathname}) RETURNING id`;
  redirect(`/projects/${project.id}`);
}
