import type { Metadata } from "next";
import Link from "next/link";
import {
  formatEditorialDate,
  PublicEntryList,
  YoutubeEmbed,
} from "@/components/public-entry-list";
import { NamedViewTransition } from "@/components/view-transition";
import {
  getPublicEntries,
  type PublicEntry,
  type PublicPerformance,
} from "@/lib/public-content";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Music",
  description: "Piano performances and writing about music by Pablo Pupo.",
  canonical: "/music",
});

export const revalidate = 60;

function isPerformanceEntry(
  entry: PublicEntry
): entry is PublicEntry & { performance: PublicPerformance } {
  return entry.kind === "performance" && entry.performance !== null;
}

export default async function Music() {
  const entries = (await getPublicEntries()).filter(
    (entry) => entry.section === "music"
  );
  const performances = entries.filter(isPerformanceEntry);
  const writing = entries.filter((entry) => entry.kind !== "performance");

  return (
    <div className="public-index music-index">
      <header className="page-header section-index-header">
        <p className="eyebrow">Piano</p>
        <h1>Music</h1>
        <p>
          Performances, practice notes, and writing about the music I study.
        </p>
      </header>

      <section className="index-section" aria-labelledby="performances-title">
        <div className="section-heading">
          <h2 id="performances-title">Performances</h2>
        </div>
        {performances.length > 0 ? (
          <div className="performance-list">
            {performances.map((entry) => {
              const performance = entry.performance;
              return (
                <article className="performance" key={entry.slug}>
                  <div className="performance-heading">
                    <div>
                      <p className="eyebrow">
                        {performance.workTitle} · {performance.composer}
                      </p>
                      <h3>
                        <NamedViewTransition
                          name={`entry-${entry.section}-${entry.slug}`}
                        >
                          <Link href={`/music/${entry.slug}`}>
                            {entry.title}
                          </Link>
                        </NamedViewTransition>
                      </h3>
                    </div>
                    {performance.performedAt && (
                      <time dateTime={performance.performedAt}>
                        {formatEditorialDate(performance.performedAt)}
                      </time>
                    )}
                  </div>
                  <YoutubeEmbed
                    url={performance.youtubeUrl}
                    title={`${performance.workTitle} by ${performance.composer}`}
                  />
                  {entry.summary && (
                    <p className="performance-summary">{entry.summary}</p>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="empty-state">No performances published yet.</p>
        )}
      </section>

      <section
        className="index-section reading-shell"
        aria-labelledby="music-writing-title"
      >
        <div className="section-heading">
          <h2 id="music-writing-title">Writing about music</h2>
        </div>
        <PublicEntryList
          entries={writing}
          emptyMessage="No music writing published yet."
        />
      </section>
    </div>
  );
}
