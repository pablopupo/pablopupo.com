import PostSeriesList from "@/components/post-series-list";
import { collectSeries } from "@/lib/series";
import BackLink from "@/components/back-link";
import { PublicEntryList } from "@/components/public-entry-list";
import { isTechnicalEntry } from "@/lib/editorial";
import { createPageMetadata } from "@/lib/metadata";
import { getPublicEntries } from "@/lib/public-content";

export const revalidate = 60;
export const metadata = createPageMetadata({ title: "Engineering notes", description: "Notes on building software, AI experiments, and engineering decisions by Pablo Pupo.", canonical: "/work/notes" });
export default async function EngineeringNotes() {
  const entries = (await getPublicEntries()).filter(isTechnicalEntry);
  return <div className="editorial-page reading-shell">
    <BackLink href="/work" label="engineering" />
    <header className="editorial-header"><h1>Engineering notes</h1><p>What I’m building, testing, and learning along the way.</p></header>
    <PostSeriesList series={collectSeries(entries)} />
    <PublicEntryList entries={entries} emptyMessage="No engineering notes published yet." />
    <footer className="editorial-contact"><a href="/rss.xml">Follow new posts</a></footer>
  </div>;
}
