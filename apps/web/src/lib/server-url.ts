import { ENV } from "@/env";

/**
 * Base URL of the API server.
 *
 * In the browser we talk to same-origin paths, which Vite proxies to the API
 * server (see `vite.config.ts`). That keeps the app working from any host — a
 * second laptop on the LAN included — with no CORS. During the shell prerender
 * we call the server directly.
 */
export function getServerBaseUrl(): string {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return ENV.VITE_SERVER_URL || "http://localhost:3000";
}
