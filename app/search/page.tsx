import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";
import {
  SEARCH_QUERY_MAX_LENGTH,
  searchPublicContent,
} from "@/lib/search";
import { SearchResults } from "./search-results";

export const metadata: Metadata = {
  ...createPageMetadata({
    title: "Search",
    description: "Search Pablo Pupo's public writing, music, and work.",
    canonical: "/search",
  }),
  robots: { index: false, follow: true },
};

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const parameters = await searchParams;
  const value = Array.isArray(parameters.q) ? parameters.q[0] : parameters.q;
  const response = await searchPublicContent(value);

  return (
    <div className="public-index reading-shell">
      <header className="page-header">
        <p className="eyebrow">Across the site</p>
        <h1>Search</h1>
        <p>Find public writing, music, and work.</p>
      </header>
      <form role="search" action="/search" method="get" className="site-search">
        <label htmlFor="site-search-query">Search the site</label>
        <div className="site-search-controls">
          <input
            id="site-search-query"
            name="q"
            type="search"
            defaultValue={response.query}
            maxLength={SEARCH_QUERY_MAX_LENGTH}
            autoComplete="off"
          />
          <button type="submit">Search</button>
        </div>
      </form>
      <SearchResults response={response} />
    </div>
  );
}
