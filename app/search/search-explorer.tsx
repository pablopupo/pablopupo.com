"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { PublicGraphData } from "@/lib/public-graph";
import type { SearchResponse } from "@/lib/search";
import { HeaderSearchPanel, resultStatus, scheduleHeaderSearch, type HeaderSearchResponse } from "../header-search";

export default function SearchExplorer({ initialResponse, graph }: { initialResponse: SearchResponse; graph: PublicGraphData }) {
  const searchParams = useSearchParams();
  const urlQuery = searchParams ? searchParams.get("q") ?? "" : initialResponse.query;
  const [query, setQuery] = useState(urlQuery);
  const [response, setResponse] = useState<HeaderSearchResponse>({ ...initialResponse, total: initialResponse.results.length });
  const [status, setStatus] = useState(initialResponse.status === "empty" ? "Choose a point or type a search." : resultStatus(response));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setQuery(urlQuery); }, [urlQuery]);

  useEffect(() => {
    if (query === initialResponse.query) {
      const initial = { ...initialResponse, total: initialResponse.results.length };
      setResponse(initial);
      setStatus(initial.status === "empty" ? "Choose a point or type a search." : resultStatus(initial));
      return;
    }
    setResponse({ status: "empty", query, results: [], total: 0, message: null });
    if (query.trim().length < 2) {
      setStatus(query.trim() ? "Type at least 2 characters." : "Choose a point or type a search.");
      window.history.replaceState(window.history.state, "", query ? `/search?q=${encodeURIComponent(query)}` : "/search");
      return;
    }
    setStatus("Searching…");
    return scheduleHeaderSearch(query, {
      allResults: true,
      fetcher: fetch,
      onPending: () => setStatus("Searching…"),
      onError: () => setStatus("Search is temporarily unavailable."),
      onResponse: (next) => {
        setResponse(next);
        setStatus(resultStatus(next));
        window.history.replaceState(window.history.state, "", `/search?q=${encodeURIComponent(next.query)}`);
      },
    });
  }, [query, initialResponse]);

  return <HeaderSearchPanel idPrefix="site" inputRef={inputRef} query={query} onChange={(event) => setQuery(event.target.value)} onChoose={setQuery}
    onResultClick={() => undefined} plainLinks={false} response={response} status={status} graph={graph} />;
}
