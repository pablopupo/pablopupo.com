import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required before running database migrations");
}

const pool = new Pool({ connectionString: databaseUrl });
try {
  const database = drizzle(pool);
  await migrate(database, { migrationsFolder: "drizzle" });
} finally {
  await pool.end();
}

console.log("Database migrations applied");
