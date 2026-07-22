import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("legacy admin removal", () => {
  it.each([
    "lib/admin-session.ts",
    "lib/admin-session.test.ts",
    "app/api/admin/login/route.ts",
    "app/api/admin/posts/route.ts",
    "app/api/admin/publish/route.ts",
  ])("removes %s", (relativePath) => {
    expect(fs.existsSync(path.join(process.cwd(), relativePath))).toBe(false);
  });
});
