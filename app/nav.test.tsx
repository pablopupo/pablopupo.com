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
    transitionTypes: _transitionTypes,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
    transitionTypes?: string[];
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
  it("uses the wordmark for home and names the five public sections", () => {
    pathname = "/writing/example";

    const html = renderToStaticMarkup(<Nav />);

    expect(html.match(/data-next-link="true"/g)).toHaveLength(6);
    expect(html).toContain(
      '<a href="/" data-next-link="true" class="wordmark">Pablo Pupo</a>'
    );
    expect(html).toContain('<a href="/accordo" data-next-link="true">Accordo</a>');
    expect(html).toContain('<a href="/work" data-next-link="true">Engineering</a>');
    expect(html).toContain(
      '<a href="/writing" data-next-link="true" aria-current="page">Writing<span class="nav-current-indicator" aria-hidden="true"></span></a>'
    );
    expect(html).toContain('<a href="/music" data-next-link="true">Music</a>');
    expect(html).toContain('<a href="/about" data-next-link="true">About</a>');
    expect(html).not.toContain("Projects");
    expect(html).not.toContain("Contributions");
  });

  it("marks Engineering current for project detail routes", () => {
    pathname = "/work/gradus-ad-parnassum";
    const html = renderToStaticMarkup(<Nav />);
    expect(html).toContain('<a href="/work" data-next-link="true" aria-current="page">Engineering<span class="nav-current-indicator" aria-hidden="true"></span></a>');
    pathname = "/";
    expect(renderToStaticMarkup(<Nav />)).not.toContain('aria-current="page"');
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
    expect(html).toContain('<a href="/accordo">Accordo</a>');
    expect(html).toContain('<a href="/work">Engineering</a>');
    expect(html).toContain('<a href="/writing">Writing</a>');
  });
});
