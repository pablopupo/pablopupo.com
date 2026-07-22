import { describe, expect, it } from "vitest";
import {
  createEntryMetadata,
  createPageMetadata,
  createRootMetadata,
} from "./metadata";
import { siteDescription, siteTitle, siteUrl } from "./site";
import { DEFAULT_PUBLIC_PROFILE } from "./public-profile";

describe("root metadata", () => {
  it("publishes RSS, Open Graph, and Twitter discovery metadata", () => {
    const metadata = createRootMetadata(DEFAULT_PUBLIC_PROFILE);

    expect(metadata).toMatchObject({
      metadataBase: new URL(siteUrl),
      title: {
        default: siteTitle,
        template: `%s · ${siteTitle}`,
      },
      description: siteDescription,
      alternates: {
        types: { "application/rss+xml": "/rss.xml" },
      },
      openGraph: {
        type: "website",
        url: "/",
        siteName: siteTitle,
        title: siteTitle,
        description: siteDescription,
        images: [{ url: "/opengraph-image", alt: "Pablo Pupo" }],
      },
      twitter: {
        card: "summary_large_image",
        title: siteTitle,
        description: siteDescription,
        images: ["/opengraph-image"],
      },
    });
    expect(metadata.alternates).not.toHaveProperty("canonical");
  });

  it("uses UI-managed profile values", () => {
    const metadata = createRootMetadata({
      ...DEFAULT_PUBLIC_PROFILE,
      siteTitle: "Pablo's Notebook",
      headline: "Applied AI Engineer",
    });

    expect(metadata.title).toEqual({
      default: "Pablo's Notebook",
      template: "%s · Pablo's Notebook",
    });
    expect(metadata.description).toContain("Applied AI Engineer");
    expect(metadata.openGraph).toMatchObject({
      siteName: "Pablo's Notebook",
      title: "Pablo's Notebook",
    });
  });
});

describe("entry metadata", () => {
  const entry = {
    id: null,
    slug: "evaluation-notes",
    kind: "note" as const,
    section: "writing" as const,
    tags: ["Evaluation", "Applied AI"],
    title: "Evaluation notes",
    summary: "Measuring an applied AI system before trusting it.",
    bodyMarkdown: "## Evaluation\nMeasure first.",
    publishedAt: "2026-07-20T12:00:00.000Z",
    readMinutes: 4,
    performance: null,
  };

  it("publishes canonical article and social metadata", () => {
    expect(createEntryMetadata(entry)).toMatchObject({
      title: "Evaluation notes",
      description: "Measuring an applied AI system before trusting it.",
      keywords: ["Evaluation", "Applied AI"],
      alternates: {
        canonical: "/writing/evaluation-notes",
        types: { "application/rss+xml": "/rss.xml" },
      },
      openGraph: {
        type: "article",
        url: "/writing/evaluation-notes",
        title: "Evaluation notes",
        description: "Measuring an applied AI system before trusting it.",
        publishedTime: "2026-07-20T12:00:00.000Z",
        tags: ["Evaluation", "Applied AI"],
        images: [{ url: "/opengraph-image", alt: "Pablo Pupo" }],
      },
      twitter: {
        card: "summary_large_image",
        title: "Evaluation notes",
        description: "Measuring an applied AI system before trusting it.",
        images: ["/opengraph-image"],
      },
    });
  });

  it("uses a bounded plain-text body excerpt when no summary is set", () => {
    const metadata = createEntryMetadata({
      ...entry,
      summary: null,
      bodyMarkdown: `## What I measured\n[Retrieval quality](https://example.com) with <T> values ${"x".repeat(180)}`,
    });

    expect(metadata.description).toMatch(/^What I measured Retrieval quality with <T> values/);
    expect(metadata.description).not.toContain("https://");
    expect(String(metadata.description)).toHaveLength(160);
    expect(metadata.description).toMatch(/…$/);
  });
});

describe("page metadata", () => {
  it("keeps RSS discovery and describes the shared page URL", () => {
    expect(
      createPageMetadata({
        title: "Work",
        description: "Projects and open-source contributions by Pablo Pupo.",
        canonical: "/work",
      })
    ).toMatchObject({
      title: "Work",
      alternates: {
        canonical: "/work",
        types: { "application/rss+xml": "/rss.xml" },
      },
      openGraph: {
        type: "website",
        url: "/work",
        title: "Work",
        description: "Projects and open-source contributions by Pablo Pupo.",
      },
      twitter: {
        card: "summary_large_image",
        title: "Work",
        description: "Projects and open-source contributions by Pablo Pupo.",
      },
    });
  });
});
