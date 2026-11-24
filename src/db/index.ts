import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { getServerEnv } from "@/lib/env";
import * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

let cachedDb: Database | null = null;

export function getDb(): Database {
  if (cachedDb === null) {
    const { DATABASE_URL } = getServerEnv();
    const sqlClient = neon(DATABASE_URL);
    cachedDb = drizzle(sqlClient, { schema });
  }
  return cachedDb;
}
