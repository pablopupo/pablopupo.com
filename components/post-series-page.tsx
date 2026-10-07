import Link from "@/components/page-link";
import BackLink from "./back-link";
import { entrySeries, type PostSeries } from "@/lib/series";
import { formatEditorialDate, YoutubeEmbed } from "./public-entry-list";

export default function PostSeriesPage({ series }: { series: PostSeries }) {
  const first = series.entries[0];
  const latest = series.entries.filter((entry) => entry.performance).sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))[0];
  return <div className="editorial-page post-series-page">
    <BackLink href={`/${series.section}`} label={series.section === "music" ? "music" : "writing"} />
    <header className="editorial-header">
      <p className="series-context">{series.section === "music" ? "Music series" : "Writing series"} · {series.entries.length} {series.entries.length === 1 ? "post" : "posts"}</p>
      <h1>{series.title}</h1>
      <div className="editorial-links">
        {first && <Link href={`/${first.section}/${first.slug}`}>Start with the first post</Link>}
        <a href="/rss.xml">Follow new posts</a>
      </div>
    </header>
    {latest?.performance && <section className="series-latest" aria-labelledby="latest-recording-title">
      <div className="listening-heading"><div><p className="series-context">Latest recording</p><h2 id="latest-recording-title">{latest.performance.workTitle}</h2></div><Link className="editorial-link" href={`/${latest.section}/${latest.slug}`}>Watch &amp; read notes</Link></div>
      <YoutubeEmbed url={latest.performance.youtubeUrl} title={`${latest.performance.workTitle} by ${latest.performance.composer}`} />
    </section>}
    <section className="series-posts" aria-labelledby="series-posts-title">
      <h2 id="series-posts-title">All posts</h2>
      <ol>{series.entries.map((entry) => {
        const membership = entrySeries(entry);
        return <li key={entry.slug}>
          <div className="series-post-position">{membership?.part ? <span aria-label={`Part ${membership.part}`}>{String(membership.part).padStart(2, "0")}</span> : <span className="series-post-dot" aria-hidden="true" />}</div>
          <article><p className="series-post-date"><time dateTime={entry.publishedAt}>{formatEditorialDate(entry.publishedAt)}</time>{entry.performance && <span>Video &amp; notes</span>}</p><h3><Link href={`/${entry.section}/${entry.slug}`}>{entry.title}</Link></h3>{entry.summary && <p>{entry.summary}</p>}</article>
        </li>;
      })}</ol>
    </section>
  </div>;
}
