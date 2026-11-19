"use server";

import { ownsBlobPath } from "@/lib/blob-path";
import { head } from "@vercel/blob";
import { redirect } from "next/navigation";
import { requireUserId, signIn, signOut } from "@/auth";
import { sql } from "@/lib/db";

export async function signInLocally() {
  if (
    process.env.NODE_ENV !== "development" ||
    process.env.LOCAL_DEV_AUTH !== "true"
  )
    throw new Error("Local preview is disabled");
  await signIn("local-preview", { redirectTo: "/" });
}

export async function signInWithGoogle() {
  await signIn("google");
}

export async function signOutUser() {
  await signOut({ redirectTo: "/" });
}

export async function createProject(pathname: string) {
  const userId = await requireUserId();
  // The client tells us where it uploaded; only accept the user's own, existing blob.
  if (!ownsBlobPath(pathname, userId)) throw new Error("Invalid path");
  const blob = await head(pathname);
  if (!blob.contentType?.startsWith("image/") || blob.size > 20 * 1024 * 1024)
    throw new Error("Invalid image");
  const [project] = await sql`
    INSERT INTO projects (user_id, image_pathname) VALUES (${userId}, ${pathname}) RETURNING id`;
  redirect(`/projects/${project.id}`);
}
