import type { NextAuthConfig } from "next-auth";

export const authConfig: NextAuthConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;
      const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/api/auth");

      if (isAuthRoute) {
        if (isLoggedIn && pathname === "/login") {
          return Response.redirect(new URL("/produtos", nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) {
        return false; // Redirects to /login
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as unknown as { role: string }).role;
        token.tenantId = (user as unknown as { tenantId: string }).tenantId;
        token.rememberMe = (user as unknown as { rememberMe?: boolean }).rememberMe === true;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        (session.user as unknown as { role: string }).role = token.role as string;
        (session.user as unknown as { tenantId: string }).tenantId = token.tenantId as string;
      }
      return session;
    },
  },
  providers: [], // Added in auth.ts (node runtime)
};
