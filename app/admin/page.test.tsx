import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import Admin from "./page";

const environmentKeys = [
  "DATABASE_URL",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "ADMIN_GITHUB_ID",
] as const;
const originalEnvironment = Object.fromEntries(
  environmentKeys.map((key) => [key, process.env[key]])
);

afterEach(() => {
  for (const key of environmentKeys) {
    const value = originalEnvironment[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("admin page", () => {
  it("renders a build-safe local configuration state with no environment", async () => {
    for (const key of environmentKeys) delete process.env[key];

    const html = renderToStaticMarkup(await Admin());

    expect(html).toContain("Admin configuration is incomplete");
    expect(html).toContain("GITHUB_CLIENT_ID");
    expect(html).toContain("ADMIN_GITHUB_ID");
  });
});
