import type {
  AnchorHTMLAttributes,
  ChangeEventHandler,
  ComponentType,
  ReactNode,
  RefObject,
} from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchResponse } from "@/lib/search";
import * as headerSearchModule from "./header-search";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} data-next-link="true" {...props}>
      {children}
    </a>
  ),
}));

type HeaderSearchResponse = SearchResponse & { total: number };

type HeaderSearchPanelProps = {
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: ChangeEventHandler<HTMLInputElement>;
  onResultClick: () => void;
  plainLinks: boolean;
  query: string;
  response: HeaderSearchResponse | null;
  status: string;
};

type SearchScheduler = (
  query: string,
  options: {
    fetcher: typeof fetch;
    onError: () => void;
    onPending: () => void;
    onResponse: (response: HeaderSearchResponse) => void;
  }
) => () => void;

type CloseSearch = (
  reason: "escape" | "outside" | "route" | "toggle",
  setOpen: (open: boolean) => void,
  toggle: Pick<HTMLButtonElement, "focus"> | null
) => void;

const feature = headerSearchModule as unknown as {
  HeaderSearchPanel?: ComponentType<HeaderSearchPanelProps>;
  closeHeaderSearch?: CloseSearch;
  scheduleHeaderSearch?: SearchScheduler;
};
const source = readFileSync(
  join(process.cwd(), "app", "header-search.tsx"),
  "utf8"
);

const response: HeaderSearchResponse = {
  status: "ready",
  query: "reliability",
  message: null,
  total: 8,
  results: [
    {
      type: "entry",
      title: "Reliability notes",
      summary: "How I evaluate systems before shipping them.",
      href: "/writing/reliability-notes",
      section: "Writing",
      publishedAt: "2026-07-20T12:00:00.000Z",
    },
  ],
};

afterEach(() => {
  vi.useRealTimers();
});

describe("header search", () => {
  it("renders the expanded search as a fallback GET form with semantic live results", () => {
    expect(feature.HeaderSearchPanel).toBeTypeOf("function");
    if (!feature.HeaderSearchPanel) return;

    const html = renderToStaticMarkup(
      <feature.HeaderSearchPanel
        inputRef={{ current: null }}
        onChange={() => undefined}
        onResultClick={() => undefined}
        plainLinks={false}
        query="reliability"
        response={response}
        status="Showing 1 of 8 results."
      />
    );

    expect(html).toContain('<form role="search"');
    expect(html).toContain('action="/search"');
    expect(html).toContain('method="get"');
    expect(html).toContain('name="q"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("<ol");
    expect(html).toContain(
      '<a href="/writing/reliability-notes" data-next-link="true"'
    );
    expect(html).toContain("Reliability notes");
    expect(html).toContain("Showing 1 of 8 results.");
  });

  it("lets the GET form submit instead of swallowing Enter and button clicks", () => {
    expect(source).not.toContain(
      "onSubmit={(event) => event.preventDefault()}"
    );
  });

  it("closes when a result changes only the current path hash", () => {
    expect(source).toContain("onClick={onResultClick}");
    expect(source).toContain('onResultClick={() => close("route")}');
  });

  it("references a results container only while it exists", () => {
    expect(feature.HeaderSearchPanel).toBeTypeOf("function");
    if (!feature.HeaderSearchPanel) return;

    const html = renderToStaticMarkup(
      <feature.HeaderSearchPanel
        inputRef={{ current: null }}
        onChange={() => undefined}
        onResultClick={() => undefined}
        plainLinks={false}
        query=""
        response={null}
        status="Search writing, music, and work."
      />
    );

    expect(html).not.toContain('aria-controls="header-search-results"');
  });

  it("names the toggle as a close control while search is open", () => {
    expect(source).toContain(
      'aria-label={open ? "Close search" : "Search this site"}'
    );
  });

  it("waits 250 milliseconds before issuing an encoded GET request", async () => {
    vi.useFakeTimers();
    expect(feature.scheduleHeaderSearch).toBeTypeOf("function");
    if (!feature.scheduleHeaderSearch) return;

    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
      })
    );
    const onPending = vi.fn();
    const onResponse = vi.fn();
    const onError = vi.fn();

    feature.scheduleHeaderSearch("  applied   AI  ", {
      fetcher,
      onPending,
      onResponse,
      onError,
    });

    await vi.advanceTimersByTimeAsync(249);
    expect(fetcher).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/search?q=applied%20AI",
      expect.objectContaining({ method: "GET", signal: expect.any(AbortSignal) })
    );
    expect(onPending).toHaveBeenCalledOnce();
    expect(onResponse).toHaveBeenCalledWith(response);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not request a query shorter than two normalized characters", async () => {
    vi.useFakeTimers();
    expect(feature.scheduleHeaderSearch).toBeTypeOf("function");
    if (!feature.scheduleHeaderSearch) return;

    const fetcher = vi.fn<typeof fetch>();
    feature.scheduleHeaderSearch(" a ", {
      fetcher,
      onPending: vi.fn(),
      onResponse: vi.fn(),
      onError: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("aborts an active request and suppresses its stale response", async () => {
    vi.useFakeTimers();
    expect(feature.scheduleHeaderSearch).toBeTypeOf("function");
    if (!feature.scheduleHeaderSearch) return;

    let resolveRequest:
      | ((response: Response) => void)
      | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveRequest = resolve;
        })
    );
    const onResponse = vi.fn();
    const cancel = feature.scheduleHeaderSearch("reliability", {
      fetcher,
      onPending: vi.fn(),
      onResponse,
      onError: vi.fn(),
    });

    await vi.advanceTimersByTimeAsync(250);
    const signal = fetcher.mock.calls[0]?.[1]?.signal;
    cancel();
    resolveRequest?.(
      new Response(JSON.stringify(response), {
        headers: { "Content-Type": "application/json" },
      })
    );
    await Promise.resolve();
    await Promise.resolve();

    expect(signal?.aborted).toBe(true);
    expect(onResponse).not.toHaveBeenCalled();
  });

  it("restores toggle focus only when Escape closes the search", () => {
    expect(feature.closeHeaderSearch).toBeTypeOf("function");
    if (!feature.closeHeaderSearch) return;

    const setOpen = vi.fn();
    const toggle = { focus: vi.fn() };

    feature.closeHeaderSearch("outside", setOpen, toggle);
    expect(setOpen).toHaveBeenLastCalledWith(false);
    expect(toggle.focus).not.toHaveBeenCalled();

    feature.closeHeaderSearch("escape", setOpen, toggle);
    expect(toggle.focus).toHaveBeenCalledOnce();
  });
});
