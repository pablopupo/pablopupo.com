import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("reading progress", () => {
  it("clamps progress through the anchored reading body", async () => {
    const module = await import("./reading-progress").catch(() => undefined);

    expect(module?.readingProgressRatio).toBeTypeOf("function");
    expect(module!.readingProgressRatio(120, 520, 720)).toBe(0);
    expect(module!.readingProgressRatio(-180, 520, 720)).toBe(0.9);
    expect(module!.readingProgressRatio(-400, 520, 720)).toBe(1);
  });

  it("renders a quiet progress indicator tied to the primary body", async () => {
    const module = await import("./reading-progress").catch(() => undefined);
    const ReadingProgress = module?.default;

    expect(ReadingProgress).toBeTypeOf("function");
    if (!ReadingProgress) throw new Error("Missing reading progress component");
    const html = renderToStaticMarkup(
      <ReadingProgress targetId="entry-content" />
    );

    expect(html).toContain('class="reading-progress"');
    expect(html).toContain('class="reading-progress-bar"');
    expect(html).toContain('data-reading-target="entry-content"');
    expect(html).toContain('aria-hidden="true"');
  });
});
