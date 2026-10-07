import { entrySeries, seriesPath, visibleEntryTags, type seriesNeighbors } from "@/lib/series";
import Link from "@/components/page-link";
import MarkdownContent from "@/components/markdown-content";
import Comments from "@/components/comments";
import ReadingProgress from "@/components/reading-progress";
import BackLink from "@/components/back-link";
import { NamedViewTransition } from "@/components/view-transition";
import {
  formatEditorialDate,
  entryDisplayDate,
  YoutubeEmbed,
} from "@/components/public-entry-list";
import type { PublicEntry } from "@/lib/public-content";

type PublicEntryPageProps = {
  entry: PublicEntry;
  newer?: PublicEntry | null;
  older?: PublicEntry | null;
  preview?: boolean;
  seriesNavigation?: ReturnType<typeof seriesNeighbors>;
};

export function PublicEntryPage({
  entry,
  newer = null,
  older = null,
  preview = false,
  seriesNavigation = null,
}: PublicEntryPageProps) {
  const series = entrySeries(entry);
  const displayDate = entryDisplayDate(entry);
  const recording = entry.kind === "performance" ? entry.performance : null;
  // Older imported recordings contain this duplicate player link in their body.
  // Keep the saved article intact and omit only that standalone link from display.
  const body = recording ? entry.bodyMarkdown.split(/\n\s*\n/).filter((paragraph) => {
    const text = paragraph.trim();
    const link = `[Watch on YouTube](${recording.youtubeUrl})`;
    return text !== link && text !== `${link}.`;
  }).join("\n\n") : entry.bodyMarkdown;
  return (
    <article className={recording ? "entry-page recording-page" : "entry-page reading-shell"}>
      {entry.readMinutes >= 6 ? (
        <ReadingProgress targetId="entry-content" />
      ) : null}
      <header className="entry-header">
        {!preview && <BackLink href={`/${entry.section}`} label={entry.section === "music" ? "music" : "writing"} transitionTypes={recording ? ["recording"] : undefined} rememberOrigin={Boolean(recording)} />}
        {series && <nav className="entry-series" aria-label="Series"><Link href={seriesPath({ ...series, section: entry.section })}>{series.title}</Link>{series.part && <span>Part {series.part}</span>}</nav>}
        {recording && <p className="recording-composer">{recording.composer}</p>}
        <NamedViewTransition
          name={`entry-${entry.section}-${entry.slug}`}
          shareClass={recording ? "recording-title" : undefined}
        >
          <h1>{recording?.workTitle ?? entry.title}</h1>
        </NamedViewTransition>
        {recording ? <div className="recording-page-meta">
          {preview && <span>Saved preview</span>}
          {recording.performedAt && <time dateTime={recording.performedAt}>{formatEditorialDate(recording.performedAt)}</time>}
          {recording.venue && <span>{recording.venue}</span>}
        </div> : <>
        {entry.summary && <p className="entry-deck">{entry.summary}</p>}
        <p className="entry-byline">
          {preview ? (
            <span>Saved preview</span>
          ) : (
            <time dateTime={displayDate.value}>
              {displayDate.prefix}{formatEditorialDate(displayDate.value)}
            </time>
          )}
          <span>{entry.kind === "performance" ? "Performance" : `${entry.readMinutes} min read`}</span>
        </p>
        {visibleEntryTags(entry.tags).length > 0 && (
          <p className="entry-tags">{visibleEntryTags(entry.tags).join(" · ")}</p>
        )}
        </>}
      </header>

      {recording && <YoutubeEmbed url={recording.youtubeUrl} title={`${recording.workTitle} by ${recording.composer}`} transitionName={`recording-video-${entry.slug}`} posterSizes="(max-width: 860px) 100vw, 820px" />}

      <section
        id="entry-content"
        className={recording ? "entry-content recording-page-notes" : "entry-content"}
        aria-label="Article body"
      >
        {recording && (recording.notesMarkdown || body.trim()) && <h2>Notes</h2>}
        {recording?.notesMarkdown && <MarkdownContent markdown={recording.notesMarkdown} />}
        <MarkdownContent markdown={body} anchorHeadings />
      </section>
      {!preview && seriesNavigation && (seriesNavigation.previous || seriesNavigation.next) && (
        <nav className="entry-neighbors" aria-label="More in this series">
          {seriesNavigation.previous && <Link href={`/${entry.section}/${seriesNavigation.previous.slug}`}><span className="entry-neighbor-label">Previous post</span><span className="entry-neighbor-title">{seriesNavigation.previous.title}</span></Link>}
          {seriesNavigation.next && <Link className="entry-neighbor-newer" href={`/${entry.section}/${seriesNavigation.next.slug}`}><span className="entry-neighbor-label">Next post</span><span className="entry-neighbor-title">{seriesNavigation.next.title}</span></Link>}
        </nav>
      )}
      {!preview && !series && (older || newer) ? (
        <nav className="entry-neighbors" aria-label={`More ${entry.section}`}>
          {older ? (
            <Link
              className="entry-neighbor entry-neighbor-older"
              href={`/${entry.section}/${encodeURIComponent(older.slug)}`}
            >
              <span className="entry-neighbor-label">{recording ? "Previous recording" : "Older"}</span>
              <span className="entry-neighbor-title">{recording ? older.performance?.workTitle ?? older.title : older.title}</span>
            </Link>
          ) : null}
          {newer ? (
            <Link
              className="entry-neighbor entry-neighbor-newer"
              href={`/${entry.section}/${encodeURIComponent(newer.slug)}`}
            >
              <span className="entry-neighbor-label">{recording ? "Next recording" : "Newer"}</span>
              <span className="entry-neighbor-title">{recording ? newer.performance?.workTitle ?? newer.title : newer.title}</span>
            </Link>
          ) : null}
        </nav>
      ) : null}
      {!preview && entry.id ? recording
        ? <details className="recording-discussion"><summary>Discussion</summary><Comments entryId={entry.id} /></details>
        : <Comments entryId={entry.id} /> : null}
    </article>
  );
}
