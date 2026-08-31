import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

describe("site theme", () => {
  it("keeps the system preference until a valid manual choice exists", async () => {
    const theme = await import("./theme").catch(() => undefined);

    expect(theme?.storedTheme).toBeTypeOf("function");
    expect(theme?.storedTheme("light")).toBe("light");
    expect(theme?.storedTheme("dark")).toBe("dark");
    expect(theme?.storedTheme("system")).toBeNull();
    expect(theme?.storedTheme(null)).toBeNull();
  });

  it("toggles from the effective theme and persists the opposite choice", async () => {
    const theme = await import("./theme").catch(() => undefined);

    expect(theme?.nextTheme).toBeTypeOf("function");
    expect(theme?.nextTheme(null, true)).toBe("light");
    expect(theme?.nextTheme(null, false)).toBe("dark");
    expect(theme?.nextTheme("dark", false)).toBe("light");
    expect(theme?.nextTheme("light", true)).toBe("dark");
  });

  it("restores only a valid saved override before the page paints", async () => {
    const theme = await import("./theme").catch(() => undefined);

    expect(theme?.themeBootstrapScript).toEqual(expect.any(String));
    expect(theme?.THEME_STORAGE_KEY).toEqual(expect.any(String));

    function boot(saved: string | null) {
      const dataset: Record<string, string> = {};
      runInNewContext(theme!.themeBootstrapScript, {
        document: {
          documentElement: {
            dataset,
            setAttribute: (name: string, value: string) => {
              if (name === "data-theme") dataset.theme = value;
            },
          },
        },
        localStorage: { getItem: () => saved },
      });
      return dataset.theme;
    }

    expect(boot("dark")).toBe("dark");
    expect(boot("light")).toBe("light");
    expect(boot("system")).toBeUndefined();
    expect(boot(null)).toBeUndefined();
  });
});
