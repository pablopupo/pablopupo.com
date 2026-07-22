import fs from "node:fs";
import path from "node:path";
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
});
