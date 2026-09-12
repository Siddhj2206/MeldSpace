import type { Database } from "@MeldSpace/db";
import * as schema from "@MeldSpace/db/schema/auth";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
};

export function createAuth(
  env: AuthConfig,
  database: Database,
  desktopOrigins: readonly string[] = [],
) {
  // Browsers reject `Secure` cookies over plain HTTP, so a hardcoded
  // `sameSite: "none" + secure: true` breaks login on the LAN demo
  // (`http://<lan-ip>:3001`, see #4). Derive from the auth URL instead:
  // HTTPS keeps cross-site-ready cookies, plain HTTP falls back to
  // lax + insecure so the second machine can sign in.
  //
  // This is a deliberate dev/LAN-only relaxation, keyed off configuration
  // rather than the request: a deployment behind a TLS-terminating proxy
  // that reaches the app over plain HTTP is still treated as insecure.
  // Production must set BETTER_AUTH_URL to https:// for the strict branch.
  const isHttps = env.BETTER_AUTH_URL.toLowerCase().startsWith("https://");
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [...new Set([env.CORS_ORIGIN, ...desktopOrigins].filter(Boolean))],
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: isHttps
        ? {
            sameSite: "none",
            secure: true,
            httpOnly: true,
          }
        : {
            sameSite: "lax",
            secure: false,
            httpOnly: true,
          },
    },
    plugins: [],
  });
}
