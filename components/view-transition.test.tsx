import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

describe("view transition compatibility wrapper", () => {
  it("preserves route content when React ViewTransition is unavailable", async () => {
    const module = await import("./view-transition").catch(() => undefined);
    expect(module?.default).toBeTypeOf("function");
    if (!module) return;
    const ViewTransition = module.default;

    const html = renderToStaticMarkup(
      <ViewTransition
        name="route-content"
        share="route-crossfade"
        default="none"
      >
        <section>Writing</section>
      </ViewTransition>
    );

    expect(html).toBe("<section>Writing</section>");
  });

  it("preserves named shared content when React ViewTransition is unavailable", async () => {
    const module = await import("./view-transition").catch(() => undefined);
    expect(module?.NamedViewTransition).toBeTypeOf("function");
    if (!module) return;
    const NamedViewTransition = module.NamedViewTransition;

    const html = renderToStaticMarkup(
      <NamedViewTransition name="entry-writing-retrieval-notes">
        <h1>Retrieval notes</h1>
      </NamedViewTransition>
    );

    expect(html).toBe("<h1>Retrieval notes</h1>");
  });
});
