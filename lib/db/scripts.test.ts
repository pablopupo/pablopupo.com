import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("database package scripts", () => {
  it("exposes migration generation, migration execution, and legacy import", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { scripts: Record<string, string> };

    expect(packageJson.scripts).toMatchObject({
      "db:generate": "drizzle-kit generate",
      "db:migrate": "tsx scripts/migrate.ts",
      "db:import": "tsx scripts/import-legacy.ts",
    });
  });

  it.each([
    [
      "migration",
      "migrate.ts",
      "DATABASE_URL is required before running database migrations",
    ],
    [
      "legacy import",
      "import-legacy.ts",
      "DATABASE_URL is required before performing a database operation",
    ],
  ])(
    "executes the %s entry point before validating configuration",
    (_name, script, expectedError) => {
      const root = process.cwd();
      const temporaryDirectory = fs.mkdtempSync(
        path.join(os.tmpdir(), "pablopupo-db-script-")
      );
      const { DATABASE_URL: _databaseUrl, ...environment } = process.env;

      try {
        const result = spawnSync(
          process.execPath,
          ["--import", require.resolve("tsx"), path.join(root, "scripts", script)],
          {
            cwd: temporaryDirectory,
            env: environment,
            encoding: "utf8",
          }
        );

        expect(result.status).toBe(1);
        expect(result.stderr).toContain(expectedError);
        expect(result.stderr).not.toContain("Top-level await");
      } finally {
        fs.rmSync(temporaryDirectory, { recursive: true, force: true });
      }
    }
  );
});
