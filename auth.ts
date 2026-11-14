import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { redirect } from "next/navigation";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  callbacks: {
    // JWT sessions have no user id by default; the Google account id (token.sub) is ours.
    session({ session, token }) {
      session.user.id = token.sub!;
      return session;
    },
  },
});

export async function requireUserId() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return session.user.id;
}
