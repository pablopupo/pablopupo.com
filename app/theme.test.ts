import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

describe("site theme", () => {
  it("accepts only a valid manual theme choice", async () => {
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
    expect(theme?.nextTheme(null)).toBe("dark");
    expect(theme?.nextTheme("system")).toBe("dark");
    expect(theme?.nextTheme("dark")).toBe("light");
    expect(theme?.nextTheme("light")).toBe("dark");
  });

  it("defaults to light and restores a valid saved override before paint", async () => {
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
    expect(boot("system")).toBe("light");
    expect(boot(null)).toBe("light");
  });
});
