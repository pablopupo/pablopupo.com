import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

function color(name: string) {
  const match = css.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"));
  if (!match) throw new Error(`Missing --${name} color`);
  return match[1];
}

function luminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/../g)!
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(left: string, right: string) {
  const values = [luminance(left), luminance(right)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function mediaSection(maxWidth: number) {
  const start = css.indexOf(`@media (max-width: ${maxWidth}px)`);
  if (start === -1) return "";
  const end = css.indexOf("@media", start + 1);
  return css.slice(start, end === -1 ? undefined : end);
}

describe("public color contrast", () => {
  it("keeps muted text at WCAG AA contrast on the page background", () => {
    expect(contrast(color("muted"), color("bg"))).toBeGreaterThanOrEqual(4.5);
  });

  it("defines an explicit dark palette and lets the system lead before manual choice", () => {
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{/);
    expect(css).toMatch(/:root\[data-theme="light"\]\s*\{/);
    expect(css).toMatch(
      /@media\s*\(prefers-color-scheme:\s*dark\)[\s\S]*:root:not\(\[data-theme\]\)/
    );
  });
});

describe("homepage identity layout", () => {
  it("scales the desktop type toward the preferred 120 percent zoom", () => {
    const document = css.match(/html\s*\{([^}]*)\}/)?.[1];

    expect(document).toContain(
      "font-size: clamp(1rem, 0.887rem + 0.348vw, 1.2rem)"
    );
  });

  it("keeps the public canvas close to the reading measure", () => {
    const shell = css.match(
      /body > header,\s*body > main,\s*body > footer\s*\{([^}]*)\}/
    )?.[1];
    const adminShell = css.match(
      /body:has\(\.admin-shell, \.admin-state\) > header,\s*body:has\(\.admin-shell, \.admin-state\) > main,\s*body:has\(\.admin-shell, \.admin-state\) > footer\s*\{([^}]*)\}/
    )?.[1];
    const readingShell = css.match(/\.reading-shell\s*\{([^}]*)\}/)?.[1];
    const hero = css.match(/\.hero\s*\{([^}]*)\}/)?.[1];
    const portrait = css.match(/\.portrait-frame\s*\{([^}]*)\}/)?.[1];
    const portraitImage = css.match(
      /\.portrait-frame img\s*\{([^}]*)\}/
    )?.[1];

    expect(shell).toContain("44rem");
    expect(adminShell).toContain("60rem");
    expect(readingShell).toContain("42rem");
    expect(hero).toContain("13.5rem");
    expect(hero).toContain("gap: 2.2rem");
    expect(portrait).toContain("13.5rem");
    expect(portraitImage).toMatch(/object-position:\s*center\s*;/);
    expect(portraitImage).not.toMatch(/transform/);
  });

  it("uses a focused prose measure and stronger introduction typography", () => {
    const readingShell = css.match(/\.reading-shell\s*\{([^}]*)\}/)?.[1];
    const introduction = css.match(
      /\.hero-copy > \.markdown-content\s*\{([^}]*)\}/
    )?.[1];

    expect(readingShell).toContain("42rem");
    expect(introduction).toContain("color: var(--ink)");
    expect(introduction).toMatch(/font-size:\s*1\.(?:18|2)rem/);
    expect(introduction).toMatch(/font-weight:\s*(?:5[5-9]0|600)/);
  });

  it("separates the introduction from the unboxed graph with one hairline", () => {
    const hiddenHeading = css.match(/\.visually-hidden\s*\{([^}]*)\}/)?.[1];
    const graph = css.match(/\.home-connections\s*\{([^}]*)\}/)?.[1];

    expect(hiddenHeading).toContain("position: absolute");
    expect(hiddenHeading).toContain("clip-path: inset(50%)");
    expect(graph).toBeDefined();
    expect(graph).toContain("border-top: 1px solid var(--hairline)");
    expect(graph).toMatch(/padding-top:\s*1(?:\.\d+)?rem/);
    expect(graph).not.toMatch(/background/);
  });

  it("lets the graph break out from the editorial shell without widening mobile", () => {
    const graph = css.match(/\.home-connections\s*\{([^}]*)\}/)?.[1];
    const layout = css.match(/\.graph-layout\s*\{([^}]*)\}/)?.[1];
    const mobileStyles = css.slice(css.indexOf("@media (max-width: 520px)"));
    const mobileGraph = mobileStyles.match(
      /\.home-connections\s*\{([^}]*)\}/
    )?.[1];

    expect(graph).toContain("width: min(100vw - 2.5rem, 52rem)");
    expect(graph).toContain("margin-left: 50%");
    expect(graph).toContain("transform: translateX(-50%)");
    expect(layout).toContain("25rem");
    expect(mobileGraph).toContain("width: 100%");
    expect(mobileGraph).toContain("transform: none");
  });

  it("keeps homepage icon links separate from About-page text links", () => {
    const iconLinks = css.match(/\.profile-icon-links\s*\{([^}]*)\}/)?.[1];
    const iconTargets = css.match(
      /\.profile-icon-links a\s*\{([^}]*)\}/
    )?.[1];
    const textLinks = css.match(
      /\.profile-links,\s*\.project-links\s*\{([^}]*)\}/
    )?.[1];

    expect(iconLinks).toBeDefined();
    expect(iconTargets).toContain("width: 2.75rem");
    expect(iconTargets).toContain("height: 2.75rem");
    expect(textLinks).toBeDefined();
  });

  it("does not remove the visible focus ring from header search", () => {
    expect(css).not.toMatch(
      /\.header-search-input:focus\s*\{[^}]*outline\s*:\s*0/
    );
  });

  it("keeps header controls large enough and removes covered links from focus", () => {
    const navigationTargets = css.match(
      /body > header nav a\s*\{([^}]*)\}/
    )?.[1];
    const wordmark = css.match(
      /body > header nav \.wordmark\s*\{([^}]*)\}/
    )?.[1];
    const navLinks = css.match(/\.nav-links\s*\{([^}]*)\}/)?.[1];
    const toggle = css.match(/\.header-search-toggle\s*\{([^}]*)\}/)?.[1];
    const input = css.match(/\.header-search-input\s*\{([^}]*)\}/)?.[1];
    const submit = css.match(/\.header-search-submit\s*\{([^}]*)\}/)?.[1];
    const coveredLinks = css.match(
      /body > header nav:has\(\.header-search-toggle\[aria-expanded="true"\]\)\s*> \.nav-links\s*> a,\s*body > header nav:has\(\.header-search-toggle\[aria-expanded="true"\]\)\s*> \.wordmark\s*\{([^}]*)\}/
    )?.[1];

    expect(navigationTargets).toContain("min-width: 2.75rem");
    expect(wordmark).toContain("font-size: 1.4rem");
    expect(wordmark).toContain("line-height: 1");
    expect(wordmark).toContain("transform: translateY(0.08em)");
    expect(navLinks).toContain("position: relative");
    expect(toggle).toContain("width: 2.75rem");
    expect(toggle).toContain("height: 2.75rem");
    expect(input).toContain("min-height: 2.75rem");
    expect(submit).toContain("min-height: 2.75rem");
    expect(coveredLinks).toContain("visibility: hidden");
  });

  it("pairs the SVG map with a readable side inspector", () => {
    const layout = css.match(/\.graph-layout\s*\{([^}]*)\}/)?.[1];
    const map = css.match(/\.graph-map\s*\{([^}]*)\}/)?.[1];
    const inspector = css.match(/\.graph-inspector\s*\{([^}]*)\}/)?.[1];
    const hitTarget = css.match(/\.graph-node-hit\s*\{([^}]*)\}/)?.[1];
    const connectedButton = css.match(
      /\.graph-connections button\s*\{([^}]*)\}/
    )?.[1];

    expect(layout).toContain("display: grid");
    expect(layout).toContain("grid-template-columns");
    expect(map).toContain("touch-action: pan-y");
    expect(inspector).toContain("border-left: 1px solid var(--hairline)");
    expect(hitTarget).toContain("fill: transparent");
    expect(connectedButton).toContain("min-height: 2.75rem");
  });

  it("keeps graph marks and labels legible inside the narrower site", () => {
    const mark = css.match(/\.graph-node-mark\s*\{([^}]*)\}/)?.[1];
    const label = css.match(/\.graph-node-label\s*\{([^}]*)\}/)?.[1];

    expect(mark).toContain("transform-box: fill-box");
    expect(mark).toContain("transform 160ms ease");
    expect(label).toContain("font-size: 12px");
  });

  it("contains variable inspector content inside a stable desktop graph stage", () => {
    const layout = css.match(/\.graph-layout\s*\{([^}]*)\}/)?.[1];
    const map = css.match(/\.graph-map\s*\{([^}]*)\}/)?.[1];
    const inspector = css.match(/\.graph-inspector\s*\{([^}]*)\}/)?.[1];
    const compactStyles = mediaSection(760);
    const compactLayout = compactStyles.match(
      /\.graph-layout\s*\{([^}]*)\}/
    )?.[1];
    const compactMap = compactStyles.match(/\.graph-map\s*\{([^}]*)\}/)?.[1];
    const compactInspector = compactStyles.match(
      /\.graph-inspector\s*\{([^}]*)\}/
    )?.[1];

    expect(layout).toMatch(/height:\s*clamp\(/);
    expect(map).toContain("height: 100%");
    expect(map).toContain("min-height: 0");
    expect(inspector).toContain("min-height: 0");
    expect(inspector).toContain("overflow-y: auto");
    expect(compactLayout).toContain("height: auto");
    expect(compactMap).toContain("height: auto");
    expect(compactInspector).toContain("overflow-y: visible");
  });

  it("keeps graph focus visible and stacks the inspector on small screens", () => {
    const dimmed = css.match(
      /\.graph-map-edge\.is-dimmed,\s*\.graph-map-node\.is-dimmed\s*\{([^}]*)\}/
    )?.[1];
    expect(css).toMatch(
      /\.graph-map-node:focus-visible\s+\.graph-node-mark\s*\{[^}]*stroke:\s*var\(--accent\)/
    );
    expect(css).toMatch(/\.graph-map-node:focus\s*\{[^}]*outline:\s*none/);
    expect(dimmed).toContain("opacity: 0.42");
    const compactStyles = mediaSection(760);
    const layout = compactStyles.match(/\.graph-layout\s*\{([^}]*)\}/)?.[1];
    const inspector = compactStyles.match(
      /\.graph-inspector\s*\{([^}]*)\}/
    )?.[1];
    const labels = compactStyles.match(
      /\.graph-node-label\s*\{([^}]*)\}/
    )?.[1];

    expect(layout).toContain("grid-template-columns: 1fr");
    expect(inspector).toContain("border-left: 0");
    expect(inspector).toContain("border-top: 1px solid var(--hairline)");
    expect(labels).toContain("font-size: 14px");
  });

  it("crossfades only the graph inspector during local selection changes", () => {
    const content = css.match(
      /\.graph-inspector-content\s*\{([^}]*)\}/
    )?.[1];

    expect(content).toContain("view-transition-name: graph-inspector");
    expect(css).toMatch(
      /::view-transition-old\(graph-inspector\)\s*\{[^}]*route-fade-out/
    );
    expect(css).toMatch(
      /::view-transition-new\(graph-inspector\)\s*\{[^}]*route-fade-in/
    );
    expect(css).toMatch(
      /html\.graph-inspector-transition::view-transition-old\(root\)[\s\S]*animation:\s*none/
    );
    expect(css).toMatch(
      /html\.graph-inspector-transition::view-transition-group\(root\)\s*\{[^}]*animation:\s*none/
    );
  });

  it("keeps the tablet portrait inside its grid track", () => {
    const tabletStyles = css.slice(
      css.indexOf("@media (max-width: 760px)"),
      css.indexOf("@media (max-width: 520px)")
    );
    const portrait = tabletStyles.match(
      /\.portrait-frame\s*\{([^}]*)\}/
    )?.[1];

    expect(portrait).toContain("width: 10rem");
  });

  it("gives mobile navigation a separate full-width row below its actions", () => {
    const mobileStyles = css.slice(css.indexOf("@media (max-width: 520px)"));
    const navLinks = mobileStyles.match(/\.nav-links\s*\{([^}]*)\}/)?.[1];
    const navActions = mobileStyles.match(/\.nav-actions\s*\{([^}]*)\}/)?.[1];

    expect(navLinks).toContain("width: 100%");
    expect(navLinks).toMatch(/order:\s*3/);
    expect(navActions).toBeDefined();
  });

  it("keeps mobile search aligned with both header actions", () => {
    const tabletStyles = css.slice(
      css.indexOf("@media (max-width: 760px)"),
      css.indexOf("@media (max-width: 520px)")
    );
    const panel = tabletStyles.match(
      /\.header-search-panel\s*\{([^}]*)\}/
    )?.[1];

    expect(panel).toContain("top: 1.15rem");
    expect(panel).toContain("right: 5.5rem");
    expect(panel).toContain("transform: none");
    expect(tabletStyles).not.toMatch(
      /\.header-search-toggle\[aria-expanded="true"\]\s*\{[^}]*position:\s*absolute/
    );
  });

  it("uses text-first entry rows with left-aligned metadata and open spacing", () => {
    const list = css.match(/\.public-entry-list\s*\{([^}]*)\}/)?.[1];
    const row = css.match(/\.public-entry-list article\s*\{([^}]*)\}/)?.[1];
    const title = css.match(
      /\.public-entry-list h2 a\s*\{([^}]*)\}/
    )?.[1];
    const meta = css.match(/\.entry-meta-primary\s*\{([^}]*)\}/)?.[1];

    expect(list).toBeDefined();
    expect(list).not.toMatch(/border/);
    expect(row).not.toMatch(/grid-template-columns/);
    expect(row).toMatch(/padding-block:\s*2(?:\.\d+)?rem/);
    expect(title).toContain("color: var(--accent)");
    expect(meta).toContain("text-align: left");
  });

  it("styles article navigation and utilities as quiet, accessible controls", () => {
    const codeBlock = css.match(/\.code-block\s*\{([^}]*)\}/)?.[1];
    const copyButton = css.match(/\.code-copy-button\s*\{([^}]*)\}/)?.[1];
    const anchor = css.match(/\.heading-anchor\s*\{([^}]*)\}/)?.[1];
    const progress = css.match(/\.reading-progress\s*\{([^}]*)\}/)?.[1];
    const neighbors = css.match(/\.entry-neighbors\s*\{([^}]*)\}/)?.[1];
    const portraitLink = css.match(/\.portrait-link\s*\{([^}]*)\}/)?.[1];

    expect(codeBlock).toContain("position: relative");
    expect(copyButton).toContain("min-width: 2.75rem");
    expect(copyButton).toContain("min-height: 2.75rem");
    expect(copyButton).toContain("background: var(--code-control-bg)");
    expect(copyButton).toContain("color: var(--code-control-ink)");
    expect(anchor).toContain("opacity: 0");
    expect(progress).toContain("position: fixed");
    expect(progress).toContain("pointer-events: none");
    expect(neighbors).toContain("border-top: 1px solid var(--hairline)");
    expect(portraitLink).toContain("width: fit-content");
  });

  it("uses one clock for the page, route, and shared titles", () => {
    expect(css).toMatch(
      /::view-transition-old\(root\)\s*\{[^}]*animation:\s*route-fade-out 250ms ease-out both/
    );
    expect(css).toMatch(
      /::view-transition-new\(root\)\s*\{[^}]*animation:\s*route-fade-in 250ms ease-out both/
    );
    expect(css).toMatch(
      /::view-transition-old\(\.route-crossfade\)\s*\{[^}]*animation:\s*route-fade-out 250ms ease-out both/
    );
    expect(css).toMatch(
      /::view-transition-new\(\.route-crossfade\)\s*\{[^}]*animation:\s*route-fade-in 250ms ease-out both/
    );
    expect(css).toMatch(
      /::view-transition-group\(\.entry-title\)\s*\{[^}]*animation-duration:\s*250ms[^}]*animation-timing-function:\s*ease-out/
    );
    expect(css).not.toContain("site-header");
    expect(css).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*::view-transition-old\(\*\)[\s\S]*animation-duration:\s*0s !important/
    );
  });

  it("aligns public section introductions to the reading measure", () => {
    const header = css.match(
      /\.section-index-header\s*\{([^}]*)\}/
    )?.[1];

    expect(header).toContain("width: min(100%, 42rem)");
    expect(header).toContain("margin-inline: auto");
  });
});
