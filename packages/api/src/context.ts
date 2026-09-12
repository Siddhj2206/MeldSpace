import type { createAuth } from "@MeldSpace/auth";
import type { Database } from "@MeldSpace/db";

export type Context = {
  auth: null;
  session: Awaited<ReturnType<ReturnType<typeof createAuth>["api"]["getSession"]>>;
  db: Database;
};
