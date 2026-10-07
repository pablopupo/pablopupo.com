import Link from "@/components/page-link";
import { seriesPath, type PostSeries } from "@/lib/series";

export default function PostSeriesList({ series }: { series: PostSeries[] }) {
  if (!series.length) return null;
  return <section className="post-series-section" aria-labelledby="post-series-title">
    <div className="editorial-section-heading"><h2 id="post-series-title">Series</h2></div>
    <div className="post-series-list">{series.map((item) => <article key={`${item.section}:${item.slug}`}>
      <h3><Link href={seriesPath(item)}>{item.title}</Link></h3>
      <p>{item.entries.length} {item.entries.length === 1 ? "post" : "posts"}{item.entries.some((entry) => entry.performance) ? ", with recordings and notes" : ""}</p>
      <Link className="editorial-link" href={seriesPath(item)}>Browse the series</Link>
    </article>)}</div>
  </section>;
}
