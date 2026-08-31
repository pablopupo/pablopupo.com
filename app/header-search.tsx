"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEventHandler,
  type RefObject,
} from "react";
import type { SearchResponse } from "@/lib/search";

export type HeaderSearchResponse = SearchResponse & { total: number };

type HeaderSearchPanelProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onResultClick: () => void;
  plainLinks: boolean;
  query: string;
  response: HeaderSearchResponse | null;
  status: string;
};

type SearchScheduleOptions = {
  fetcher: typeof fetch;
  onError: () => void;
  onPending: () => void;
  onResponse: (response: HeaderSearchResponse) => void;
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
        `/api/search?q=${encodeURIComponent(normalized)}`,
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
}: HeaderSearchPanelProps) {
  const ResultLink = plainLinks ? "a" : Link;
  const results = response?.status === "ready" ? response.results : [];

  return (
    <div className="header-search-panel">
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
          aria-label="Search this site"
          aria-controls={
            results.length > 0 ? "header-search-results" : undefined
          }
          aria-describedby="header-search-status"
          className="header-search-input"
          onChange={onChange}
        />
        <button type="submit" className="header-search-submit">
          Search
        </button>
      </form>
      <p
        id="header-search-status"
        className="header-search-status"
        role="status"
        aria-live="polite"
      >
        {status}
      </p>
      {results.length > 0 ? (
        <ol id="header-search-results" className="header-search-results">
          {results.map((result) => (
            <li key={`${result.type}:${result.href}`}>
              <ResultLink href={result.href} onClick={onResultClick}>
                <span className="header-search-result-meta">
                  {result.section}
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
    </div>
  );
}

function resultStatus(response: HeaderSearchResponse) {
  if (response.status === "invalid") {
    return response.message ?? "Enter a different search.";
  }
  if (response.total === 0) {
    return `No results for “${response.query}”.`;
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
    if (open) inputRef.current?.focus();
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
      setStatus("Search writing, music, and work.");
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
      {open ? (
        <div id="header-search-panel">
          <HeaderSearchPanel
            inputRef={inputRef}
            onChange={(event) => setQuery(event.target.value)}
            onResultClick={() => close("route")}
            plainLinks={plainLinks}
            query={query}
            response={response}
            status={status}
          />
        </div>
      ) : null}
    </div>
  );
}
