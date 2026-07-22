import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const example = readFileSync(join(process.cwd(), ".env.example"), "utf8");

function values() {
  return Object.fromEntries(
    example
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

describe("example environment", () => {
  it("lists every admin and media configuration key without secrets", () => {
    const environment = values();

    expect(Object.keys(environment)).toEqual([
      "DATABASE_URL",
      "GITHUB_CLIENT_ID",
      "GITHUB_CLIENT_SECRET",
      "BETTER_AUTH_SECRET",
      "BETTER_AUTH_URL",
      "ADMIN_GITHUB_ID",
      "BLOB_READ_WRITE_TOKEN",
      "BLOB_STORE_ID",
      "VERCEL_OIDC_TOKEN",
    ]);
    expect(environment).toMatchObject({
      GITHUB_CLIENT_ID: "",
      GITHUB_CLIENT_SECRET: "",
      BETTER_AUTH_SECRET: "",
      BETTER_AUTH_URL: "http://localhost:3000",
      ADMIN_GITHUB_ID: "145598901",
      BLOB_READ_WRITE_TOKEN: "",
      BLOB_STORE_ID: "",
      VERCEL_OIDC_TOKEN: "",
    });
  });
});
