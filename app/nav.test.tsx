import type { AnchorHTMLAttributes, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} data-next-link="true" {...props}>
      {children}
    </a>
  ),
}));

import Nav from "./nav";

beforeEach(() => {
  pathname = "/";
});

describe("site navigation", () => {
  it("keeps the wordmark visible and exposes Home plus the four public sections", () => {
    pathname = "/writing/example";

    const html = renderToStaticMarkup(<Nav />);

    expect(html.match(/data-next-link="true"/g)).toHaveLength(6);
    expect(html).toContain(
      '<a href="/" data-next-link="true" class="wordmark">Pablo Pupo</a>'
    );
    expect(html).toContain('<a href="/" data-next-link="true">Home</a>');
    expect(html).toContain('<a href="/work" data-next-link="true">Work</a>');
    expect(html).toContain(
      '<a href="/writing" data-next-link="true" aria-current="page">Writing</a>'
    );
    expect(html).toContain('<a href="/music" data-next-link="true">Music</a>');
    expect(html).toContain('<a href="/about" data-next-link="true">About</a>');
    expect(html).not.toContain("Projects");
    expect(html).not.toContain("Contributions");
  });

  it("marks Home current only on the homepage", () => {
    pathname = "/";
    const homeHtml = renderToStaticMarkup(<Nav />);

    pathname = "/writing";
    const writingHtml = renderToStaticMarkup(<Nav />);

    expect(homeHtml).toContain(
      '<a href="/" data-next-link="true" aria-current="page">Home</a>'
    );
    expect(writingHtml).toContain('<a href="/" data-next-link="true">Home</a>');
  });

  it("provides an accessible inline-search toggle instead of a search-page link", () => {
    const html = renderToStaticMarkup(<Nav />);

    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="Search this site"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('aria-controls="header-search-panel"');
    expect(html).not.toContain('href="/search"');
  });

  it("keeps navigation links separate from search and theme actions", () => {
    const html = renderToStaticMarkup(<Nav />);

    expect(html).toContain('class="nav-links"');
    expect(html).toContain('class="nav-actions"');
    expect(html).toContain('class="theme-toggle"');
    expect(html).toContain('aria-label="Switch color theme"');
  });

  it("uses plain anchors on admin paths so dirty editors receive beforeunload", () => {
    pathname = "/admin/revisions";

    const html = renderToStaticMarkup(<Nav />);

    expect(html).not.toContain('data-next-link="true"');
    expect(html).toContain('<a href="/" class="wordmark">Pablo Pupo</a>');
    expect(html).toContain('<a href="/">Home</a>');
    expect(html).toContain('<a href="/work">Work</a>');
    expect(html).toContain('<a href="/writing">Writing</a>');
  });
});
