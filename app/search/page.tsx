import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";
import {
  searchPublicContent,
} from "@/lib/search";
import SearchExplorer from "./search-explorer";
import { getPublicEntries, getPublicProjects } from "@/lib/public-content";
import { getPublicGraph } from "@/lib/public-graph";
import { buildHomeGraph } from "@/lib/home-graph";

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
  const [response, entries, projects] = await Promise.all([searchPublicContent(value), getPublicEntries(), getPublicProjects()]);
  const graph = buildHomeGraph(await getPublicGraph(projects, entries), entries);

  return (
    <div className="editorial-page search-page">
      <header className="editorial-header">
        <h1>Search</h1>
        <p>Projects, recordings, and writing.</p>
      </header>
      <SearchExplorer initialResponse={response} graph={graph} />
    </div>
  );
}
