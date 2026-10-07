import type { PublicEntry } from "./public-content";

export type SeriesMembership = { title: string; slug: string; part: number | null };
export type PostSeries = { title: string; slug: string; section: PublicEntry["section"]; entries: PublicEntry[] };

export function seriesSlug(title: string) {
  return title.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
}
export function isSeriesTag(tag: string) {
  return /^(series|part):/i.test(tag);
}
export function visibleEntryTags(tags: string[]) {
  return tags.filter((tag) => !isSeriesTag(tag));
}
export function entrySeries(entry: Pick<PublicEntry, "tags">): SeriesMembership | null {
  const title = entry.tags.find((tag) => /^series:/i.test(tag))?.slice(7).trim();
  if (!title || !seriesSlug(title)) return null;
  const partText = entry.tags.find((tag) => /^part:/i.test(tag))?.slice(5);
  const part = partText && /^[1-9]\d{0,2}$/.test(partText) ? Number(partText) : null;
  return { title, slug: seriesSlug(title), part };
}
export function setSeriesTags(tags: string[], title: string, part = "") {
  const retained = visibleEntryTags(tags);
  return [...retained, ...(title.trim() ? [`series:${title.trim()}`, ...(part.trim() ? [`part:${part.trim()}`] : [])] : [])];
}
export function seriesPath(series: Pick<PostSeries, "section" | "slug">) {
  return `/${series.section}/series/${encodeURIComponent(series.slug)}`;
}
export function collectSeries(entries: PublicEntry[]): PostSeries[] {
  const groups = new Map<string, PostSeries>();
  for (const entry of entries) {
    const membership = entrySeries(entry);
    if (!membership) continue;
    const key = `${entry.section}:${membership.slug}`;
    const group = groups.get(key) ?? { title: membership.title, slug: membership.slug, section: entry.section, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    group.entries.sort((a, b) => {
      const aPart = entrySeries(a)?.part ?? Infinity;
      const bPart = entrySeries(b)?.part ?? Infinity;
      return (aPart === bPart ? 0 : aPart - bPart) || a.publishedAt.localeCompare(b.publishedAt) || a.slug.localeCompare(b.slug);
    });
  }
  return [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
}
export function seriesNeighbors(entries: PublicEntry[], current: PublicEntry) {
  const membership = entrySeries(current);
  if (!membership) return null;
  const group = collectSeries(entries).find((series) => series.section === current.section && series.slug === membership.slug);
  if (!group) return null;
  const index = group.entries.findIndex((entry) => entry.slug === current.slug);
  if (index === -1) return null;
  return { previous: group.entries[index - 1] ?? null, next: group.entries[index + 1] ?? null };
}
