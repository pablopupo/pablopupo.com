import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";

vi.mock("next/navigation", () => ({
  usePathname: () => "/writing",
}));

vi.mock("@/components/view-transition", () => ({
  default: ({
    children,
    default: defaultClass,
    enter,
    exit,
    name,
    share,
  }: {
    children: ReactNode;
    default?: string;
    enter?: string;
    exit?: string;
    name?: string;
    share?: string;
  }) => (
    <div
      data-default={defaultClass}
      data-enter={enter}
      data-exit={exit}
      data-name={name}
      data-share={share}
    >
      {children}
    </div>
  ),
}));

describe("route transitions", () => {
  it("enables Next route transition integration", () => {
    expect(nextConfig.experimental?.viewTransition).toBe(true);
  });

  it("crossfades independent route snapshots without sharing their geometry", async () => {
    const module = await import("./route-transition").catch(() => undefined);
    expect(module?.default).toBeTypeOf("function");
    if (!module) return;
    const RouteTransition = module.default;
    const source = readFileSync(
      join(process.cwd(), "app", "route-transition.tsx"),
      "utf8"
    );
    const html = renderToStaticMarkup(
      <RouteTransition>
        <article>Page</article>
      </RouteTransition>
    );

    expect(source).toContain("const pathname = usePathname()");
    expect(source).toContain("key={pathname}");
    expect(html).toContain('data-enter="route-crossfade"');
    expect(html).toContain('data-exit="route-crossfade"');
    expect(html).toContain('data-default="none"');
    expect(html).not.toContain("data-name=");
    expect(html).not.toContain("data-share=");
    expect(html).toContain("<article>Page</article>");
  });
});
