import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type ContentDatabase = NeonHttpDatabase<typeof schema>;

let database: ContentDatabase | undefined;

export function getDatabase(): ContentDatabase {
  if (database) return database;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before performing a database operation");
  }

  database = drizzle(neon(databaseUrl), { schema });
  return database;
}
