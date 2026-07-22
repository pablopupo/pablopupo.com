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
            <div className="entry-copy">
              <h2>
                <a href={`/${entry.section}/${entry.slug}`}>{entry.title}</a>
              </h2>
              {entry.summary && <p>{entry.summary}</p>}
            </div>
            <div className="entry-meta">
              <span>
                <time dateTime={entry.publishedAt}>
                  {formatEditorialDate(entry.publishedAt)}
                </time>
                {` · ${entry.readMinutes} min read`}
              </span>
              {entry.tags.length > 0 && <span>{entry.tags.join(" · ")}</span>}
            </div>
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
