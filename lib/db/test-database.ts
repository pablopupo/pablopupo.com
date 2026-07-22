import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

export const PGLITE_TEST_TIMEOUT_MS = 30_000;

export function getMigrationFiles(): string[] {
  const directory = path.join(process.cwd(), "drizzle");
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => path.join(directory, file));
}

export async function createMigratedDatabase(): Promise<PGlite | undefined> {
  const migrationFiles = getMigrationFiles();
  if (migrationFiles.length === 0) return undefined;

  const client = new PGlite();
  for (const migrationFile of migrationFiles) {
    await client.exec(fs.readFileSync(migrationFile, "utf8"));
  }
  return client;
}
