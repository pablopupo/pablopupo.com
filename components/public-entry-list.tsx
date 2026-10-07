import { visibleEntryTags } from "@/lib/series";
import Link from "@/components/page-link";
import YoutubePlayer from "./youtube-player";
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
  headingLevel?: 2 | 3;
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

export function entryDisplayDate(entry: Pick<PublicEntryListItem, "kind" | "publishedAt" | "performance">) {
  const details = entry.performance;
  const performedAt = details && typeof details === "object" && "performedAt" in details && typeof details.performedAt === "string" ? details.performedAt : null;
  return entry.kind === "performance"
    ? { value: performedAt ?? entry.publishedAt, prefix: performedAt ? "Performed " : "Published " }
    : { value: entry.publishedAt, prefix: "" };
}

export function PublicEntryList({
  entries,
  emptyMessage,
  headingLevel = 2,
}: PublicEntryListProps) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  if (entries.length === 0) {
    return <p className="empty-state">{emptyMessage}</p>;
  }

  return (
    <ol className="editorial-list public-entry-list">
      {entries.map((entry) => {
        const date = entryDisplayDate(entry);
        return (
        <li key={entry.slug}>
          <article>
            <NamedViewTransition
                name={`entry-${entry.section}-${entry.slug}`}
              >
              <Heading className="entry-list-heading">
                <Link
                  className="entry-title-link"
                  href={`/${entry.section}/${entry.slug}`}
                >
                  {entry.title}
                </Link>
              </Heading>
            </NamedViewTransition>
            <p className="entry-meta entry-meta-primary">
              <time dateTime={date.value}>
                {date.prefix}{formatEditorialDate(date.value)}
              </time>
              <span aria-hidden="true">·</span>
              <span>{entry.kind === "performance" ? "Performance" : `${entry.readMinutes} min read`}</span>
            </p>
            {entry.summary && <p className="entry-summary">{entry.summary}</p>}
            {visibleEntryTags(entry.tags).length > 0 && (
              <p className="entry-tags">{visibleEntryTags(entry.tags).join(" · ")}</p>
            )}
          </article>
        </li>
      );})}
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

export function YoutubeEmbed({ url, title, transitionName, posterSizes }: { url: string; title: string; transitionName?: string; posterSizes?: string }) {
  const id = youtubeVideoId(url);
  if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;

  return <YoutubePlayer key={id} id={id} title={title} transitionName={transitionName} posterSizes={posterSizes} />;
}
