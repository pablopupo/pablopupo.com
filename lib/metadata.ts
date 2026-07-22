import type { Metadata } from "next";
import type { PublicEntry } from "./public-content";
import type { PublicProfile } from "./public-profile";
import {
  createSiteIdentity,
  publicEntryPath,
  siteTitle,
  siteUrl,
} from "./site";

function plainText(markdown: string) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^\s*(?:[-+*]|\d+\.)\s+/gm, "")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function entryDescription(entry: PublicEntry) {
  const description = plainText(entry.summary?.trim() || entry.bodyMarkdown);
  if (description.length <= 160) return description;
  return `${description.slice(0, 159).trimEnd()}…`;
}

export function createPublicAlternates(canonical: string) {
  return {
    canonical,
    types: { "application/rss+xml": "/rss.xml" },
  };
}

export function createPageMetadata({
  title,
  description,
  canonical,
}: {
  title: string;
  description: string;
  canonical: string;
}): Metadata {
  return {
    title,
    description,
    alternates: createPublicAlternates(canonical),
    openGraph: {
      type: "website",
      url: canonical,
      siteName: siteTitle,
      title,
      description,
      images: [{ url: "/opengraph-image", alt: siteTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/opengraph-image"],
    },
  };
}

export function createRootMetadata(profile: PublicProfile): Metadata {
  const identity = createSiteIdentity(profile);
  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: identity.name,
      template: `%s · ${identity.name}`,
    },
    description: identity.description,
    authors: [{ name: identity.name, url: siteUrl }],
    creator: identity.name,
    alternates: {
      types: { "application/rss+xml": "/rss.xml" },
    },
    openGraph: {
      type: "website",
      url: "/",
      siteName: identity.name,
      title: identity.name,
      description: identity.description,
      images: [{ url: "/opengraph-image", alt: identity.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: identity.name,
      description: identity.description,
      images: ["/opengraph-image"],
    },
  };
}

export function createEntryMetadata(entry: PublicEntry): Metadata {
  const canonical = publicEntryPath(
    entry.section,
    encodeURIComponent(entry.slug)
  );
  const description = entryDescription(entry);
  return {
    title: entry.title,
    description,
    keywords: entry.tags,
    authors: [{ name: siteTitle, url: siteUrl }],
    alternates: createPublicAlternates(canonical),
    openGraph: {
      type: "article",
      url: canonical,
      siteName: siteTitle,
      title: entry.title,
      description,
      publishedTime: entry.publishedAt,
      tags: entry.tags,
      images: [{ url: "/opengraph-image", alt: siteTitle }],
    },
    twitter: {
      card: "summary_large_image",
      title: entry.title,
      description,
      images: ["/opengraph-image"],
    },
  };
}
