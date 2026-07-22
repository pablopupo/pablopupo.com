import type { PublicProfile } from "./public-profile";
import { absoluteSiteUrl, createProfileDescription } from "./site";

type FeedEntry = {
  slug: string;
  section: "writing" | "music";
  tags: string[];
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  publishedAt: string;
};

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function plainText(markdown: string) {
  return markdown
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function entryDescription(entry: FeedEntry) {
  const description = plainText(entry.summary?.trim() || entry.bodyMarkdown);
  if (description.length <= 500) return description;
  return `${description.slice(0, 497).trimEnd()}…`;
}

function entryUrl(entry: FeedEntry) {
  return absoluteSiteUrl(
    `/${entry.section}/${encodeURIComponent(entry.slug)}`
  );
}

function itemXml(entry: FeedEntry) {
  const url = entryUrl(entry);
  const categories = [
    entry.section === "music" ? "Music" : "Writing",
    ...entry.tags,
  ]
    .map((category) => `      <category>${escapeXml(category)}</category>`)
    .join("\n");
  return [
    "    <item>",
    `      <title>${escapeXml(entry.title)}</title>`,
    `      <link>${escapeXml(url)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(url)}</guid>`,
    `      <pubDate>${new Date(entry.publishedAt).toUTCString()}</pubDate>`,
    `      <description>${escapeXml(entryDescription(entry))}</description>`,
    categories,
    "    </item>",
  ].join("\n");
}

export function createRssFeed(
  entries: FeedEntry[],
  profile: PublicProfile
) {
  const sortedEntries = [...entries].sort((left, right) =>
    right.publishedAt.localeCompare(left.publishedAt)
  );
  const items = sortedEntries.map(itemXml).join("\n");
  const lastBuildDate = sortedEntries[0]
    ? `    <lastBuildDate>${new Date(
        sortedEntries[0].publishedAt
      ).toUTCString()}</lastBuildDate>\n`
    : "";
  const portraitUrl = absoluteSiteUrl(profile.portraitUrl);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(`${profile.siteTitle} · Writing & Music`)}</title>
    <link>${absoluteSiteUrl("/")}</link>
    <description>${escapeXml(createProfileDescription(profile))}</description>
    <language>en-US</language>
    <atom:link href="${absoluteSiteUrl(
      "/rss.xml"
    )}" rel="self" type="application/rss+xml"/>
${lastBuildDate}    <ttl>5</ttl>
    <generator>pablopupo.com</generator>
    <image>
      <url>${escapeXml(portraitUrl)}</url>
      <title>${escapeXml(profile.siteTitle)}</title>
      <link>${absoluteSiteUrl("/")}</link>
    </image>
${items ? `${items}\n` : ""}  </channel>
</rss>
`;
}
