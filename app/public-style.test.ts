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

  it("defines explicit light and dark palettes without automatic system switching", () => {
    expect(css).toMatch(/:root\[data-theme="dark"\]\s*\{/);
    expect(css).toMatch(/:root\[data-theme="light"\]\s*\{/);
    expect(css).not.toMatch(/prefers-color-scheme/);
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

  it("uses readable introduction typography beneath the visible name", () => {
    const readingShell = css.match(/\.reading-shell\s*\{([^}]*)\}/)?.[1];
    const introduction = css.match(
      /\.hero-copy > \.markdown-content\s*\{([^}]*)\}/
    )?.[1];

    expect(readingShell).toContain("42rem");
    expect(introduction).toContain("color: var(--ink)");
    expect(introduction).toContain("font-size: 1rem");
    expect(introduction).toContain("line-height: 1.6");
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

  it("aligns the graph with the editorial shell on every screen size", () => {
    const graph = css.match(/\.home-connections\s*\{([^}]*)\}/)?.[1];
    const layout = css.match(/\.graph-layout\s*\{([^}]*)\}/)?.[1];
    expect(graph).toContain("width: 100%");
    expect(graph).not.toMatch(/margin-left|transform|100vw/);
    expect(layout).toContain("25rem");
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

  it("keeps header controls large enough", () => {
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

    expect(navigationTargets).toContain("min-width: 2.75rem");
    expect(wordmark).toContain("font-size: 1.4rem");
    expect(wordmark).toContain("line-height: 1");
    expect(wordmark).toContain("transform: translateY(0.08em)");
    expect(navLinks).toContain("position: relative");
    expect(toggle).toContain("width: 2.75rem");
    expect(toggle).toContain("height: 2.75rem");
    expect(input).toContain("min-height: 2.75rem");
    expect(submit).toContain("min-height: 2.75rem");
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
    const label = css.match(/\.graph-map-organic \.graph-node-label\s*\{([^}]*)\}/)?.[1];

    expect(mark).toContain("transform-box: fill-box");
    expect(mark).toContain("transform 160ms ease");
    expect(label).toContain("font-size: 13px");
    expect(label).toContain("font-family: var(--sans)");
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

    expect(content).not.toContain("view-transition-name");
    expect(css).toMatch(/html\.graph-inspector-transition \.graph-inspector-content\s*\{[^}]*view-transition-name:\s*graph-inspector/);
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
      /\.public-entry-list \.entry-list-heading a\s*\{([^}]*)\}/
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

  it("keeps the shell steady while pages settle and titles move together", () => {
    expect(css).toMatch(
      /::view-transition-new\(root\)\s*\{[^}]*animation:\s*none/
    );
    expect(css).toMatch(
      /::view-transition-old\(\.page-motion\)\s*\{[^}]*animation:\s*section-leave-left 220ms/
    );
    expect(css).toMatch(
      /::view-transition-new\(\.page-motion\)\s*\{[^}]*animation:\s*section-enter-right 440ms/
    );
    expect(css).toMatch(
      /::view-transition-group\(\.entry-title\),\s*::view-transition-group\(\.brand-mark\),\s*::view-transition-group\(connections-destination\),\s*::view-transition-group\(\.navigation-indicator\)\s*\{[^}]*animation-duration:\s*440ms/
    );
    expect(css).toMatch(/html\[data-navigation-input="keyboard"\]::view-transition-new\(\*\)\s*\{[^}]*animation-duration:\s*0s !important/);
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
