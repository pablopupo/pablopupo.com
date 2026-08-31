import Link from "next/link";
import { NamedViewTransition } from "./view-transition";

export type PublicEntryListItem = {
  slug: string;
  kind: "note" | "essay" | "performance";
  section: "writing" | "music";
  tags: string[];
  title: string;
  summary: string | null;
  publishedAt: string;
  readMinutes: number;
  performance?: unknown;
};

type PublicEntryListProps = {
  entries: PublicEntryListItem[];
  emptyMessage: string;
};

const editorialDate = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

export function formatEditorialDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : editorialDate.format(date);
}

export function PublicEntryList({
  entries,
  emptyMessage,
}: PublicEntryListProps) {
  if (entries.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <ol className="editorial-list public-entry-list">
      {entries.map((entry) => (
        <li key={entry.slug}>
          <article>
            <h2>
              <NamedViewTransition
                name={`entry-${entry.section}-${entry.slug}`}
              >
                <Link
                  className="entry-title-link"
                  href={`/${entry.section}/${entry.slug}`}
                >
                  {entry.title}
                </Link>
              </NamedViewTransition>
            </h2>
            <p className="entry-meta entry-meta-primary">
              <time dateTime={entry.publishedAt}>
                {formatEditorialDate(entry.publishedAt)}
              </time>
              <span aria-hidden="true">·</span>
              <span>{entry.readMinutes} min read</span>
            </p>
            {entry.summary && <p className="entry-summary">{entry.summary}</p>}
            {entry.tags.length > 0 && (
              <p className="entry-tags">{entry.tags.join(" · ")}</p>
            )}
          </article>
        </li>
      ))}
    </ol>
  );
}

const youtubeHosts = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

function youtubeVideoId(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.hostname === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }
    if (!youtubeHosts.has(url.hostname)) return null;
    if (url.pathname === "/watch") return url.searchParams.get("v");
    const [kind, id] = url.pathname.split("/").filter(Boolean);
    return kind === "embed" || kind === "shorts" || kind === "live" ? id : null;
  } catch {
    return null;
  }
}

export function YoutubeEmbed({ url, title }: { url: string; title: string }) {
  const id = youtubeVideoId(url);
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;

  return (
    <div className="youtube-frame">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        title={title}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        sandbox="allow-scripts allow-same-origin allow-presentation"
        allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
