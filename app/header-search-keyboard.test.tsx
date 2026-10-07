// @vitest-environment jsdom
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { HeaderSearchPanel } from "./header-search";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it("moves through suggestions with arrows and returns to the search field", () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const inputRef = createRef<HTMLInputElement>();
  try {
    act(() => root.render(<HeaderSearchPanel
      inputRef={inputRef} onChange={() => undefined} onResultClick={() => undefined}
      plainLinks query="piano" status="2 results."
      response={{ status: "ready", query: "piano", message: null, total: 2, results: ["Beethoven", "Schumann"].map((title) => ({
        type: "entry", title, summary: "A recording", section: "Music", publishedAt: "2026-09-01", href: `/music/${title.toLowerCase()}`,
      })) }}
    />));
    const links = host.querySelectorAll("#header-search-results a");
    inputRef.current!.focus();
    const press = (key: string) => act(() => {
      document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
    });
    press("ArrowDown");
    expect(document.activeElement).toBe(links[0]);
    press("ArrowDown");
    expect(document.activeElement).toBe(links[1]);
    press("ArrowUp");
    press("ArrowUp");
    expect(document.activeElement).toBe(inputRef.current);
    press("ArrowUp");
    expect(document.activeElement).toBe(links[1]);
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
