import Link from "@/components/page-link";
import type { PublicEntry } from "@/lib/public-content";
import { formatEditorialDate } from "./public-entry-list";
import { NamedViewTransition } from "./view-transition";

export function WritingPreviewList({ entries }: { entries: PublicEntry[] }) {
  return <ol className="home-writing-list">
      {entries.map((entry) => <li key={entry.slug}>
        <article>
          <NamedViewTransition name={`entry-${entry.section}-${entry.slug}`}>
            <h3><Link href={`/${entry.section}/${entry.slug}`}>{entry.title}</Link></h3>
          </NamedViewTransition>
          <p className="home-writing-meta">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 2v6M17 2v6M3 11h18M7 15h2M11 15h2M15 15h2M7 18h2M11 18h2" /></svg>
            <time dateTime={entry.publishedAt}>{formatEditorialDate(entry.publishedAt)}</time>
            <span aria-hidden="true">·</span>
            <span>{entry.readMinutes} min read</span>
          </p>
          {entry.summary && <p className="home-writing-summary">{entry.summary}</p>}
        </article>
      </li>)}
  </ol>;
}

export default function HomeWriting({ entries }: { entries: PublicEntry[] }) {
  return <section className="home-section home-writing" aria-labelledby="recent-writing-title">
    <div className="section-heading"><h2 id="recent-writing-title">Recent writing</h2></div>
    <WritingPreviewList entries={entries} />
    <div className="home-writing-all"><Link href="/writing">All posts <span aria-hidden="true">→</span></Link></div>
  </section>;
}
