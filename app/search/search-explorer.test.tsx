// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import SearchExplorer from "./search-explorer";

let urlQuery = "beethovan";
const schedule = vi.fn((..._args: unknown[]) => () => undefined);
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams({ q: urlQuery }) }));
vi.mock("../header-search", () => ({
  HeaderSearchPanel: ({ query }: { query: string }) => <input value={query} readOnly />,
  resultStatus: () => "Search results",
  scheduleHeaderSearch: (...args: unknown[]) => schedule(...args),
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { schedule.mockClear(); });

it("restores the URL's query when Back restores older cached server props", () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const initialResponse = { status: "ready" as const, query: "ai", message: null, results: [] };
  const render = () => act(() => root.render(<SearchExplorer initialResponse={initialResponse} graph={{ nodes: [], edges: [] }} />));
  try {
    render();
    expect(host.querySelector("input")?.value).toBe("beethovan");
    expect(schedule).toHaveBeenCalledWith("beethovan", expect.objectContaining({ allResults: true }));
    urlQuery = "piano";
    render();
    expect(host.querySelector("input")?.value).toBe("piano");
    expect(schedule).toHaveBeenLastCalledWith("piano", expect.any(Object));
  } finally { act(() => root.unmount()); }
});
