import type { MetadataRoute } from "next";
import {
  getPublicEntries,
  getPublicProjects,
} from "@/lib/public-content";
import {
  absoluteSiteUrl,
  publicEntryPath,
  siteUrl,
} from "@/lib/site";

export const revalidate = 60;

function newestPublication(content: Array<{ publishedAt: string }>) {
  if (content.length === 0) return undefined;
  const newest = content.reduce((current, item) =>
    item.publishedAt > current.publishedAt ? item : current
  );
  return new Date(newest.publishedAt);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [entries, projects] = await Promise.all([
    getPublicEntries(),
    getPublicProjects(),
  ]);
  const writing = entries.filter((entry) => entry.section === "writing");
  const music = entries.filter((entry) => entry.section === "music");
  const latestWriting = newestPublication(writing);
  const latestMusic = newestPublication(music);
  const latestProject = newestPublication(projects);
  const latestSiteContent = newestPublication([...entries, ...projects]);

  const pages: MetadataRoute.Sitemap = [
    {
      url: siteUrl,
      ...(latestSiteContent ? { lastModified: latestSiteContent } : {}),
    },
    {
      url: absoluteSiteUrl("/work"),
      ...(latestProject ? { lastModified: latestProject } : {}),
    },
    {
      url: absoluteSiteUrl("/writing"),
      ...(latestWriting ? { lastModified: latestWriting } : {}),
    },
    {
      url: absoluteSiteUrl("/music"),
      ...(latestMusic ? { lastModified: latestMusic } : {}),
    },
    { url: absoluteSiteUrl("/about") },
    { url: absoluteSiteUrl("/resume") },
  ];
  const entryPages: MetadataRoute.Sitemap = entries.map((entry) => ({
    url: absoluteSiteUrl(
      publicEntryPath(entry.section, encodeURIComponent(entry.slug))
    ),
    lastModified: new Date(entry.publishedAt),
  }));

  return [...pages, ...entryPages];
}
