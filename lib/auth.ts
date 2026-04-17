import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowedEmails = (process.env.ALLOWED_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    signIn({ user }) {
      if (allowedEmails.length === 0) return true; // no allowlist = allow all
      const email = user.email?.toLowerCase();
      if (email && allowedEmails.includes(email)) return true;
      return `/access-denied?email=${encodeURIComponent(user.email ?? "")}`;
    },
    // NextAuth v5 beta drops `picture`/`name` from the JWT after the first
    // sign-in unless we persist them explicitly. Pull them from the Google
    // profile the first time, then keep them around on the token forever.
    async jwt({ token, user, profile }) {
      if (profile && typeof profile === "object") {
        const p = profile as { picture?: string; name?: string; email?: string };
        if (p.picture) token.picture = p.picture;
        if (p.name) token.name = p.name;
        if (p.email) token.email = p.email;
      }
      if (user) {
        if (user.image) token.picture = user.image;
        if (user.name) token.name = user.name;
        if (user.email) token.email = user.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.image = (token.picture as string | undefined) ?? session.user.image ?? null;
        session.user.name = (token.name as string | undefined) ?? session.user.name ?? null;
        session.user.email = (token.email as string | undefined) ?? session.user.email ?? "";
      }
      return session;
    },
  },
});
