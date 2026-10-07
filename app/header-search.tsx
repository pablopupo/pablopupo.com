"use client";

import Link from "@/components/page-link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEventHandler,
  type RefObject,
} from "react";
import type { SearchResponse } from "@/lib/search";
import type { PublicGraphData } from "@/lib/public-graph";
import dynamic from "next/dynamic";

const SearchMap = dynamic(() => import("@/components/search-map"), { loading: () => <p className="search-map-loading">Loading map…</p> });

export type HeaderSearchResponse = SearchResponse & { total: number };

type HeaderSearchPanelProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onResultClick: () => void;
  plainLinks: boolean;
  query: string;
  response: HeaderSearchResponse | null;
  status: string;
  graph?: PublicGraphData | null;
  graphError?: boolean;
  onChoose?: (query: string) => void;
  idPrefix?: string;
};

type SearchScheduleOptions = {
  fetcher: typeof fetch;
  onError: () => void;
  onPending: () => void;
  onResponse: (response: HeaderSearchResponse) => void;
  allResults?: boolean;
};

type CloseReason = "escape" | "outside" | "route" | "toggle";

function normalizedQuery(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function scheduleHeaderSearch(
  query: string,
  {
    fetcher,
    onError,
    onPending,
    onResponse,
    allResults = false,
  }: SearchScheduleOptions
) {
  const normalized = normalizedQuery(query);
  if (normalized.length < 2) return () => undefined;

  const controller = new AbortController();
  let cancelled = false;
  const timer = setTimeout(async () => {
    onPending();
    try {
      const response = await fetcher(
        `/api/search?q=${encodeURIComponent(normalized)}${allResults ? "&all=1" : ""}`,
        {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        }
      );
      if (!response.ok) throw new Error("Search request failed.");
      const payload = (await response.json()) as HeaderSearchResponse;
      if (!cancelled) onResponse(payload);
    } catch {
      if (!cancelled && !controller.signal.aborted) onError();
    }
  }, 250);

  return () => {
    cancelled = true;
    clearTimeout(timer);
    controller.abort();
  };
}

export function closeHeaderSearch(
  reason: CloseReason,
  setOpen: (open: boolean) => void,
  toggle: Pick<HTMLButtonElement, "focus"> | null
) {
  setOpen(false);
  if (reason === "escape") toggle?.focus();
}

export function HeaderSearchPanel({
  inputRef,
  onChange,
  onResultClick,
  plainLinks,
  query,
  response,
  status,
  graph,
  graphError = false,
  onChoose,
  idPrefix = "header",
}: HeaderSearchPanelProps) {
  const ResultLink = plainLinks ? "a" : Link;
  const results = response?.status === "ready" ? response.results : [];

  return (
    <div className="header-search-panel" onKeyDown={(event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>(`#${idPrefix}-search-results a`));
      if (!links.length) return;
      const index = links.indexOf(document.activeElement as HTMLAnchorElement);
      if (index === -1 && document.activeElement !== inputRef.current) return;
      event.preventDefault();
      if (event.key === "ArrowDown") links[Math.min(index + 1, links.length - 1)].focus();
      else if (index === 0) inputRef.current?.focus();
      else links[index === -1 ? links.length - 1 : index - 1].focus();
    }}>
      <form
        role="search"
        action="/search"
        method="get"
        className="header-search-form"
      >
        <input
          ref={inputRef}
          type="search"
          name="q"
          value={query}
          maxLength={80}
          autoComplete="off"
          placeholder="Search projects, music, writing…"
          aria-label="Search this site"
          aria-controls={
            results.length > 0 ? `${idPrefix}-search-results` : undefined
          }
          aria-describedby={`${idPrefix}-search-status`}
          className="header-search-input"
          onChange={onChange}
        />
        <button type="submit" className="header-search-submit">
          Search
        </button>
      </form>
      <div className="search-workspace" data-has-query={Boolean(query.trim())}>
        {graph ? <SearchMap data={graph} query={query} resultHrefs={results.map((result) => result.href)} onChoose={(value) => onChoose?.(value)} />
          : <div className="search-map-loading"><p>{graphError ? "The map couldn’t load. You can still search." : "Loading map…"}</p></div>}
      <div className="search-list-panel">
      <p
        id={`${idPrefix}-search-status`}
        className="header-search-status"
        role={response?.status === "invalid" ? "alert" : "status"}
        aria-live="polite"
      >
        {status}
      </p>
      {results.length > 0 ? (
        <ol id={`${idPrefix}-search-results`} className="header-search-results" aria-label="Search results">
          {results.map((result) => (
            <li key={`${result.type}:${result.href}`}>
              <ResultLink href={result.href} onClick={onResultClick}>
                <span className="header-search-result-meta">
                  {result.kind ?? result.section}
                </span>
                <span>{result.title}</span>
                {result.summary ? (
                  <span className="header-search-result-summary">
                    {result.summary}
                  </span>
                ) : null}
              </ResultLink>
            </li>
          ))}
        </ol>
      ) : null}
      {response?.status === "ready" && response.total > results.length && <ResultLink
        href={`/search?q=${encodeURIComponent(response.query)}`}
        className="header-search-all"
        onClick={onResultClick}
      >View all {response.total} results <span aria-hidden="true">→</span></ResultLink>}
      {!query.trim() && <div className="search-starting-points">
        <h2>Start anywhere</h2>
        {["Engineering", "Music", "AI", "Payments"].map((topic) => <button type="button" key={topic} onClick={() => onChoose?.(topic)}>{topic}<span aria-hidden="true">↗</span></button>)}
      </div>}
      </div>
      </div>
    </div>
  );
}

export function resultStatus(response: HeaderSearchResponse) {
  if (response.status === "invalid") {
    return response.message ?? "Enter a different search.";
  }
  if (response.total === 0) {
    return `No results for “${response.query}”. Try a project, composer, or topic.`;
  }
  const noun = response.total === 1 ? "result" : "results";
  if (response.results.length < response.total) {
    return `Showing ${response.results.length} of ${response.total} ${noun}.`;
  }
  return `${response.total} ${noun}.`;
}

type HeaderSearchProps = {
  pathname: string;
  plainLinks: boolean;
};

export default function HeaderSearch({
  pathname,
  plainLinks,
}: HeaderSearchProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<HeaderSearchResponse | null>(null);
  const [status, setStatus] = useState("");
  const [graph, setGraph] = useState<PublicGraphData | null>(null);
  const [graphError, setGraphError] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const previousPathname = useRef(pathname);

  const close = useCallback((reason: CloseReason) => {
    closeHeaderSearch(reason, setOpen, toggleRef.current);
    setQuery("");
    setResponse(null);
    setStatus("");
  }, []);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
      inputRef.current?.focus();
    } else dialogRef.current?.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setGraphError(false);
    fetch("/api/search/graph", { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error("Map unavailable");
      const data = await response.json() as PublicGraphData;
      if (!controller.signal.aborted) setGraph(data);
    }).catch(() => { if (!controller.signal.aborted) setGraphError(true); });
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function dismissOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close("escape");
    }

    function dismissOutside(event: PointerEvent) {
      const target = event.target;
      if (
        target instanceof Node &&
        rootRef.current &&
        !rootRef.current.contains(target)
      ) {
        close("outside");
      }
    }

    document.addEventListener("keydown", dismissOnEscape);
    document.addEventListener("pointerdown", dismissOutside);
    return () => {
      document.removeEventListener("keydown", dismissOnEscape);
      document.removeEventListener("pointerdown", dismissOutside);
    };
  }, [close, open]);

  useEffect(() => {
    if (pathname === previousPathname.current) return;
    previousPathname.current = pathname;
    close("route");
  }, [close, pathname]);

  useEffect(() => {
    setResponse(null);
    if (!open) return;

    const normalized = normalizedQuery(query);
    if (!normalized) {
      setStatus("Choose a point or type a search.");
      return;
    }
    if (normalized.length < 2) {
      setStatus("Type at least 2 characters.");
      return;
    }

    setStatus("");
    return scheduleHeaderSearch(normalized, {
      fetcher: (input, init) => fetch(input, init),
      onPending: () => setStatus("Searching…"),
      onResponse: (nextResponse) => {
        setResponse(nextResponse);
        setStatus(resultStatus(nextResponse));
      },
      onError: () => setStatus("Search is temporarily unavailable."),
    });
  }, [open, query]);

  return (
    <div className="header-search" ref={rootRef}>
      <button
        ref={toggleRef}
        type="button"
        className="header-search-toggle"
        aria-label={open ? "Close search" : "Search this site"}
        aria-expanded={open}
        aria-controls={open ? "header-search-panel" : undefined}
        onClick={() => {
          if (open) close("toggle");
          else setOpen(true);
        }}
      >
        {open ? (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m3.5 3.5 9 9m0-9-9 9" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.25" />
            <path d="m10.2 10.2 3.3 3.3" />
          </svg>
        )}
        <span>{open ? "Close search" : "Search"}</span>
      </button>
      <dialog ref={dialogRef} id="header-search-panel" className="search-dialog" aria-label="Search and explore" onCancel={(event) => { event.preventDefault(); close("escape"); }} onClick={(event) => {
        if (event.target === event.currentTarget) close("outside");
      }}>
        {open && <div className="search-dialog-content">
          <div className="search-dialog-heading"><h2>Search</h2><button type="button" onClick={() => close("escape")} aria-label="Close search"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 3.5 9 9m0-9-9 9" /></svg></button></div>
          <HeaderSearchPanel
            inputRef={inputRef}
            onChange={(event) => setQuery(event.target.value)}
            onResultClick={() => close("route")}
            plainLinks={plainLinks}
            query={query}
            response={response}
            status={status}
            graph={graph}
            graphError={graphError}
            onChoose={setQuery}
          />
        </div>}
      </dialog>
    </div>
  );
}
