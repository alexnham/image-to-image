import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { connection } from "next/server";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google,
    ...(process.env.NODE_ENV === "development" &&
    process.env.LOCAL_DEV_AUTH === "true"
      ? [
          Credentials({
            id: "local-preview",
            name: "Local preview",
            credentials: {},
            authorize: async () => ({
              id: "local-preview",
              name: "Local preview",
            }),
          }),
        ]
      : []),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    // JWT sessions have no user id by default; the Google account id (token.sub) is ours.
    session({ session, token }) {
      session.user.id = token.sub!;
      return session;
    },
  },
});

export async function requireUserId() {
  await connection();
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return session.user.id;
}
