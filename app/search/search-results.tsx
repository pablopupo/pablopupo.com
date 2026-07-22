import Link from "next/link";
import type { SearchResponse } from "@/lib/search";

function formatSearchDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function SearchResults({ response }: { response: SearchResponse }) {
  if (response.status === "empty") {
    return (
      <p className="search-prompt">Search public writing, music, and work.</p>
    );
  }
  if (response.status === "invalid") {
    return (
      <p className="search-message" role="alert">
        {response.message}
      </p>
    );
  }
  if (response.results.length === 0) {
    return <p className="search-message">No results for “{response.query}”.</p>;
  }

  const label = `${response.results.length} ${
    response.results.length === 1 ? "result" : "results"
  } for “${response.query}”`;
  return (
    <section className="search-results" aria-labelledby="search-results-heading">
      <h2 id="search-results-heading">{label}</h2>
      <ol>
        {response.results.map((result) => (
          <li key={`${result.type}:${result.href}`}>
            <p className="search-result-meta">
              <span>{result.section}</span>
              <span aria-hidden="true"> · </span>
              <time dateTime={result.publishedAt}>
                {formatSearchDate(result.publishedAt)}
              </time>
            </p>
            <h3>
              <Link href={result.href}>{result.title}</Link>
            </h3>
            {result.summary ? <p>{result.summary}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
