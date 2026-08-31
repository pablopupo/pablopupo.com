// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminPreviewFrame } from "./admin-preview-frame";

afterEach(() => {
  document.body.replaceChildren();
});

describe("admin preview frame", () => {
  it("keeps preview context and editor navigation visible around public content", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <AdminPreviewFrame
        label="Draft · Retrieval notes"
        editorHref="/admin?entry=entry-1"
      >
        <article>Rendered entry</article>
      </AdminPreviewFrame>
    );

    const frame = document.querySelector<HTMLElement>(
      "aside[aria-label='Preview status']"
    );
    const link = frame?.querySelector<HTMLAnchorElement>("a");

    expect(frame?.textContent).toContain("Owner-only preview");
    expect(frame?.textContent).toContain("Draft · Retrieval notes");
    expect(link?.textContent).toBe("Back to editor");
    expect(link?.getAttribute("href")).toBe("/admin?entry=entry-1");
    expect(document.querySelector("article")?.textContent).toBe("Rendered entry");
    expect(document.querySelector(".admin-shell")).toBeNull();
    expect(getComputedStyle(frame!).position).toBe("sticky");
  });
});
