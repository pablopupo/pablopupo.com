// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { Contribution } from "@/lib/contributions";
import EngineeringContributions from "./engineering-contributions";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); container?.remove(); });

function mount(contributions: Contribution[]) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<EngineeringContributions contributions={contributions} />));
}

function click(label: string) {
  const button = [...container.querySelectorAll("button")].find((button) => button.textContent?.startsWith(label));
  if (!button) throw new Error(`Missing button: ${label}`);
  act(() => button.click());
}

function contribution(pr: number, status: Contribution["status"]): Contribution {
  return { repo: "example/library", pr, status, title: `Change ${pr}`, url: `https://github.com/example/library/pull/${pr}`, date: "2026-09-18" };
}

describe("engineering contributions", () => {
  it("keeps merged, open, and closed work separate and resets expanded lists when switching", () => {
    mount([...Array.from({ length: 8 }, (_, i) => contribution(i + 1, "merged")), contribution(9, "open"), contribution(10, "closed")]);
    expect(container.querySelectorAll("li")).toHaveLength(6);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("6 of 8 merged");
    click("Show all 8");
    expect(container.querySelectorAll("li")).toHaveLength(8);
    click("Open");
    expect(container.querySelectorAll("li")).toHaveLength(1);
    expect(container.querySelector("li a")?.getAttribute("href")).toContain("/pull/9");
    click("Closed");
    const link = container.querySelector("li a");
    expect(link?.getAttribute("href")).toContain("/pull/10");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toContain("noopener");
    click("Merged");
    expect(container.querySelectorAll("li")).toHaveLength(6);
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toBe("Merged8");
  });

  it("starts with available work when there are no merged entries and explains empty filters", () => {
    mount([contribution(1, "open")]);
    expect(container.querySelector('button[aria-pressed="true"]')?.textContent).toBe("Open1");
    click("Closed");
    expect(container.querySelectorAll("li")).toHaveLength(0);
    expect(container.textContent).toContain("No closed contributions in this collection.");
  });
});
