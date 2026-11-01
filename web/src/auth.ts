import NextAuth, { CredentialsSignin } from "next-auth";
import { encode as defaultEncode } from "next-auth/jwt";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "./auth.config";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import * as argon2 from "argon2";
import { z } from "zod";
import { clearFailures, getClientIp, isBlocked, registerFailure } from "@/lib/auth/rate-limit";

const SESSION_REMEMBER_SECONDS = 30 * 24 * 60 * 60;
const SESSION_DEFAULT_SECONDS = 12 * 60 * 60;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  rememberMe: z.string().optional(),
});

class RateLimitedError extends CredentialsSignin {
  code = "rate_limited";
}

let dummyHash: Promise<string> | null = null;
function getDummyHash() {
  dummyHash ??= argon2.hash("senha-inexistente", { type: argon2.argon2id });
  return dummyHash;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  session: {
    strategy: "jwt",
    maxAge: SESSION_REMEMBER_SECONDS,
  },
  jwt: {
    encode: (params) =>
      defaultEncode({
        ...params,
        maxAge: params.token?.rememberMe ? SESSION_REMEMBER_SECONDS : SESSION_DEFAULT_SECONDS,
      }),
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        rememberMe: { label: "Remember Me", type: "text" },
      },
      async authorize(credentials, request) {
        const ip = getClientIp(request.headers);
        const limitKey = `login:${ip}`;

        if (isBlocked(limitKey)) {
          throw new RateLimitedError();
        }

        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) {
          registerFailure(limitKey);
          return null;
        }

        const { email, password, rememberMe } = parsed.data;

        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1);

        const hash = user && user.active ? user.passwordHash : await getDummyHash();
        const validPassword = await argon2.verify(hash, password);

        if (!user || !user.active || !validPassword) {
          registerFailure(limitKey);
          return null;
        }

        clearFailures(limitKey);

        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenantId: user.tenantId,
          rememberMe: rememberMe === "true",
        };
      },
    }),
  ],
});
