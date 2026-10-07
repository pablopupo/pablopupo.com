import type { Metadata } from "next";
import PageCopyText from "@/components/page-copy-text";
import { getPublicProfile } from "@/lib/public-profile";
import PostSeriesList from "@/components/post-series-list";
import { collectSeries } from "@/lib/series";
import Link from "@/components/page-link";
import { WritingPreviewList } from "@/components/home-writing";
import { createPageMetadata } from "@/lib/metadata";
import { getPublicEntries, type PublicEntry } from "@/lib/public-content";

export const metadata: Metadata = createPageMetadata({
  title: "Writing",
  description: "Notes and essays on software, AI, and music by Pablo Pupo.",
  canonical: "/writing",
});
export const revalidate = 60;

export default async function Writing() {
  const [allEntries, profile] = await Promise.all([getPublicEntries(), getPublicProfile()]);
  const entries = allEntries
    .filter((entry) => entry.kind !== "performance")
    .sort((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt));
  const years = new Map<number, PublicEntry[]>();
  for (const entry of entries) {
    const year = new Date(entry.publishedAt).getUTCFullYear();
    const posts = years.get(year) ?? [];
    posts.push(entry);
    years.set(year, posts);
  }

  return <div className="editorial-page writing-page">
    <header className="editorial-header">
      <div className="writing-title-row">
        <h1>Writing</h1>
        <a className="writing-rss" href="/rss.xml" aria-label="Subscribe to the RSS feed">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="5" cy="19" r="1" /><path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16" /></svg>
          RSS
        </a>
      </div>
      <PageCopyText text={profile.pageCopy.writingIntro} />
    </header>
    {entries.length > 0 ? <div className="writing-archive">
      {Array.from(years, ([year, posts]) => <section className="writing-year" key={year} aria-labelledby={`writing-year-${year}`}>
        <h2 id={`writing-year-${year}`}>{year}</h2>
        <WritingPreviewList entries={posts} />
      </section>)}
    </div> : <div className="writing-introduction">
      <p>Nothing published yet. In the meantime:</p>
      <div className="editorial-links"><Link href="/work">Engineering</Link><Link href="/music">Music</Link></div>
    </div>}
    <PostSeriesList series={collectSeries(entries)} />
  </div>;
}
