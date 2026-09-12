import { createAuthClient } from "better-auth/react";

import { getServerBaseUrl } from "./server-url";

export const authClient = createAuthClient({
  // better-auth derives its route-matching base from this URL's path, so the
  // public auth path must equal the server-side mount (/api/auth everywhere).
  // In the browser this is same-origin and proxied by Vite to the API server.
  baseURL: new URL("/api/auth", getServerBaseUrl()).toString(),
});
