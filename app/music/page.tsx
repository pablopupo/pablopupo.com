import type { Metadata } from "next";
import PageCopyText from "@/components/page-copy-text";
import Link from "@/components/page-link";
import PostSeriesList from "@/components/post-series-list";
import { collectSeries } from "@/lib/series";
import MusicLibrary from "@/components/music-library";
import { WritingPreviewList } from "@/components/home-writing";
import { createPageMetadata } from "@/lib/metadata";
import { getPublicEntries, type PublicEntry, type PublicPerformance } from "@/lib/public-content";
import { getPublicProfile } from "@/lib/public-profile";
export const metadata: Metadata = createPageMetadata({ title: "Music", description: "Piano recordings, original compositions, and writing on music by Pablo Pupo.", canonical: "/music" });
export const revalidate = 60;
export default async function Music() {
  const [allEntries, profile] = await Promise.all([getPublicEntries(), getPublicProfile()]);
  const entries = allEntries.filter((entry) => entry.section === "music");
  const recordings = entries.filter((entry): entry is PublicEntry & { performance: PublicPerformance } => entry.kind === "performance" && entry.performance !== null);
  const writing = allEntries.filter((entry) => entry.kind !== "performance" && (entry.section === "music" || entry.tags.some((tag) => tag.toLowerCase() === "music")));
  const series = collectSeries(entries);
  return <div className="editorial-page music-page">
    <header className="editorial-header">
      <h1>Music</h1>
      <PageCopyText text={profile.pageCopy.musicIntro} />
    </header>
    {series.length > 0 && <nav className="music-section-nav" aria-label="Music sections">
      {recordings.length > 0 && <a href="#recordings">Recordings</a>}
      {series.length > 0 && <a href="#music-series">Series</a>}
      {writing.length > 0 && <a href="#music-writing">Writing</a>}
    </nav>}
    <MusicLibrary recordings={recordings} pianist={profile.siteTitle} />
    {series.length > 0 && <div id="music-series" className="music-series"><PostSeriesList series={series} /></div>}
    {writing.length > 0 && <section id="music-writing" className="music-section music-writing" aria-labelledby="music-writing-title">
      <div className="music-section-heading"><h2 id="music-writing-title">Writing on music</h2><Link href="/writing">All writing</Link></div>
      <WritingPreviewList entries={writing} />
    </section>}
  </div>;
}
