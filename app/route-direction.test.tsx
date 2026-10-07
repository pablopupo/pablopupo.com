// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RouteTransition from "./route-transition";

let pathname = "/about";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/components/view-transition", () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function visit(path: string) {
  pathname = path;
  act(() => root.render(<RouteTransition><article>{path}</article></RouteTransition>));
  return document.documentElement.dataset.pageMotion;
}

describe("committed page direction", () => {
  it("resolves backward and forward slides without relying on Link transition types", () => {
    visit("/about");
    expect(visit("/writing")).toBe("back");
    expect(visit("/music")).toBe("back");
    expect(visit("/accordo")).toBe("forward");
    expect(visit("/about")).toBe("forward");
    expect(visit("/")).toBe("back");
  });

  it("follows the pages actually committed when intermediate clicks are skipped", () => {
    visit("/about");
    // Pending Music and Accordo clicks were coalesced before Writing committed.
    expect(visit("/writing")).toBe("back");
    expect(visit("/work")).toBe("back");
    expect(visit("/writing")).toBe("forward");
    expect(visit("/writing")).toBe("forward");
  });

  it.each(["/work", "/music", "/accordo"])("keeps the intentional Home to %s glide but slides on the return", (path) => {
    visit("/");
    expect(visit(path)).toBe("home");
    expect(visit("/")).toBe("back");
  });

  it("keeps section order after leaving recording and project detail pages", () => {
    visit("/music/schumann-abegg-variations");
    expect(visit("/music")).toBe("detail-back");
    expect(visit("/work")).toBe("back");
    visit("/work/kit-ai");
    expect(visit("/writing")).toBe("forward");
  });

  it("distinguishes a recording glide from section slides after rapid navigation", () => {
    visit("/music");
    expect(visit("/music/schumann-abegg-variations")).toBe("detail-forward");
    expect(visit("/about")).toBe("forward");
    expect(visit("/work")).toBe("back");
    expect(visit("/")).toBe("back");
  });
});
