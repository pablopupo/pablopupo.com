import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import ContentLink from "./content-link";
import MarkdownContent from "./markdown-content";

let pathname = "/about";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next/link", () => ({
  default: ({ transitionTypes, children, ...props }: { transitionTypes?: string[]; children: ReactNode }) =>
    <a {...props} data-client-link="true" data-motion={transitionTypes?.join(" ")}>{children}</a>,
}));
beforeEach(() => { pathname = "/about"; });

it.each(["/work", "/music", "/accordo", "/writing"])("animates a biography link to %s", (href) => {
  const html = renderToStaticMarkup(<ContentLink href={href}>Read more</ContentLink>);
  expect(html).toContain('data-client-link="true"');
  expect(html).toContain('data-motion="section-back"');
});

it("uses animated navigation for inline Markdown, reference links, and wikilinks", () => {
  const html = renderToStaticMarkup(<MarkdownContent markdown={"[Work](/work) and [Music][music], plus [[My note]].\n\n[music]: /music"} />);
  expect(html.match(/data-client-link="true"/g)).toHaveLength(3);
  expect(html).toContain('href="/writing/my-note"');
});

it.each(["https://example.com", "mailto:pablo@example.com", "/resume", "/rss.xml", "/media/file.pdf", "#notes", "/admin"])("preserves browser behavior for %s", (href) => {
  expect(renderToStaticMarkup(<ContentLink href={href}>Link</ContentLink>)).not.toContain("data-client-link");
});

it("preserves explicit new tabs, downloads, and Studio unsaved-change protection", () => {
  expect(renderToStaticMarkup(<ContentLink href="/music" target="_blank">Music</ContentLink>)).not.toContain("data-client-link");
  expect(renderToStaticMarkup(<ContentLink href="/music" download="">Music</ContentLink>)).not.toContain("data-client-link");
  pathname = "/admin/profile";
  expect(renderToStaticMarkup(<ContentLink href="/music">Music</ContentLink>)).not.toContain("data-client-link");
});
