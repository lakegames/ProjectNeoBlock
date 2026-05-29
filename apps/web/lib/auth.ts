import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import GitHubProvider from "next-auth/providers/github";

type TokenWithUid = {
  uid?: string;
  accessToken?: string;
};

const secret = process.env.NEXTAUTH_SECRET;

export const authOptions: NextAuthOptions = {
  ...(secret ? { secret } : {}),
  session: { strategy: "jwt" },
  providers: [
    ...(process.env.GITHUB_ID && process.env.GITHUB_SECRET
      ? [
          GitHubProvider({
            clientId: process.env.GITHUB_ID,
            clientSecret: process.env.GITHUB_SECRET,
            authorization: {
              params: { scope: "read:user user:email read:org" },
            },
          }),
        ]
      : []),
    Credentials({
      name: "Dev Credentials",
      credentials: {
        username: { label: "用户名", type: "text" },
      },
      async authorize(credentials) {
        if (process.env.NEOBLOCK_DEV_CREDENTIALS !== "1") return null;
        const username = credentials?.username?.trim();
        if (!username) return null;
        return { id: `dev:${username}`, name: username };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      const t = token as typeof token & TokenWithUid;
      if (account) {
        t.uid = `${account.provider}:${account.providerAccountId}`;
        if (
          typeof (account as { access_token?: unknown }).access_token ===
          "string"
        ) {
          t.accessToken = (account as { access_token: string }).access_token;
        }
      }
      if (user && (user as { id?: string }).id) {
        t.uid = (user as { id: string }).id;
      }
      return token;
    },
    async session({ session, token }) {
      const t = token as typeof token & TokenWithUid;
      if (session.user && t.uid) {
        (session.user as { id?: string }).id = t.uid;
      }
      return session;
    },
  },
};
