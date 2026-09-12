import { createAuth as createConfiguredAuth } from "@MeldSpace/auth";
import { type Database, createDb } from "@MeldSpace/db";

import { env } from "./env.server";

const db = createDb(env);

export function getDb(): Database {
  return db;
}
export const auth = createConfiguredAuth(env, db);
