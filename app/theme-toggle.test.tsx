import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("theme toggle", () => {
  it("renders an accessible 44px color-theme control", async () => {
    const module = await import("./theme-toggle").catch(() => undefined);

    expect(module?.default).toBeTypeOf("function");
    if (!module) throw new Error("Theme toggle module is unavailable");
    const html = renderToStaticMarkup(<module.default />);

    expect(html).toContain('type="button"');
    expect(html).toContain('class="theme-toggle"');
    expect(html).toContain('aria-label="Switch color theme"');
    expect(html).toContain("Theme");
  });
});
