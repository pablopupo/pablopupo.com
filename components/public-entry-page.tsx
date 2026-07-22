import MarkdownContent from "@/components/markdown-content";
import {
  formatEditorialDate,
  YoutubeEmbed,
} from "@/components/public-entry-list";
import type { PublicEntry } from "@/lib/public-content";

export function PublicEntryPage({ entry }: { entry: PublicEntry }) {
  return (
    <article className="entry-page reading-shell">
      <header className="entry-header">
        <p className="eyebrow">
          {entry.section === "music" ? "Music" : "Writing"}
        </p>
        <h1>{entry.title}</h1>
        {entry.summary && <p className="entry-deck">{entry.summary}</p>}
        <p className="entry-byline">
          <time dateTime={entry.publishedAt}>
            {formatEditorialDate(entry.publishedAt)}
          </time>
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

      <MarkdownContent markdown={entry.bodyMarkdown} />
    </article>
  );
}
