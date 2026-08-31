import Link from "next/link";
import MarkdownContent from "@/components/markdown-content";
import Comments from "@/components/comments";
import ReadingProgress from "@/components/reading-progress";
import { NamedViewTransition } from "@/components/view-transition";
import {
  formatEditorialDate,
  YoutubeEmbed,
} from "@/components/public-entry-list";
import type { PublicEntry } from "@/lib/public-content";

type PublicEntryPageProps = {
  entry: PublicEntry;
  newer?: PublicEntry | null;
  older?: PublicEntry | null;
  preview?: boolean;
};

export function PublicEntryPage({
  entry,
  newer = null,
  older = null,
  preview = false,
}: PublicEntryPageProps) {
  return (
    <article className="entry-page reading-shell">
      {entry.readMinutes >= 6 ? (
        <ReadingProgress targetId="entry-content" />
      ) : null}
      <header className="entry-header">
        <p className="eyebrow">
          <Link href={`/${entry.section}`}>
            {entry.section === "music" ? "Music" : "Writing"}
          </Link>
        </p>
        <NamedViewTransition
          name={`entry-${entry.section}-${entry.slug}`}
        >
          <h1>{entry.title}</h1>
        </NamedViewTransition>
        {entry.summary && <p className="entry-deck">{entry.summary}</p>}
        <p className="entry-byline">
          {preview ? (
            <span>Saved preview</span>
          ) : (
            <time dateTime={entry.publishedAt}>
              {formatEditorialDate(entry.publishedAt)}
            </time>
          )}
          <span>{entry.readMinutes} min read</span>
        </p>
        {entry.tags.length > 0 && (
          <p className="entry-tags">{entry.tags.join(" · ")}</p>
        )}
      </header>

      {entry.performance && (
        <section
          className="performance-context"
          aria-label="Performance details"
        >
          <p className="performance-work">{entry.performance.workTitle}</p>
          <p>{entry.performance.composer}</p>
          {(entry.performance.venue || entry.performance.performedAt) && (
            <p className="performance-meta">
              {[
                entry.performance.venue,
                entry.performance.performedAt
                  ? formatEditorialDate(entry.performance.performedAt)
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          <YoutubeEmbed
            url={entry.performance.youtubeUrl}
            title={`${entry.performance.workTitle} by ${entry.performance.composer}`}
          />
          {entry.performance.notesMarkdown && (
            <MarkdownContent markdown={entry.performance.notesMarkdown} />
          )}
        </section>
      )}

      <section
        id="entry-content"
        className="entry-content"
        aria-label="Article body"
      >
        <MarkdownContent markdown={entry.bodyMarkdown} anchorHeadings />
      </section>
      {!preview && (older || newer) ? (
        <nav className="entry-neighbors" aria-label={`More ${entry.section}`}>
          {older ? (
            <Link
              className="entry-neighbor entry-neighbor-older"
              href={`/${entry.section}/${encodeURIComponent(older.slug)}`}
            >
              <span className="entry-neighbor-label">Older</span>
              <span className="entry-neighbor-title">{older.title}</span>
            </Link>
          ) : null}
          {newer ? (
            <Link
              className="entry-neighbor entry-neighbor-newer"
              href={`/${entry.section}/${encodeURIComponent(newer.slug)}`}
            >
              <span className="entry-neighbor-label">Newer</span>
              <span className="entry-neighbor-title">{newer.title}</span>
            </Link>
          ) : null}
        </nav>
      ) : null}
      {!preview && entry.id ? <Comments entryId={entry.id} /> : null}
    </article>
  );
}
