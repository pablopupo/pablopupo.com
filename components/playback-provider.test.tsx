// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PlaybackProvider, PersistentPlayer } from "./playback-provider";
import YoutubePlayer from "./youtube-player";

let pathname = "/music";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  pathname = "/music";
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  Reflect.deleteProperty(document, "activeViewTransition");
  Reflect.deleteProperty(document, "startViewTransition");
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderPage(path: string, ids: string[]) {
  pathname = path;
  act(() => root.render(<PlaybackProvider><main>
    <PersistentPlayer />
    <div key={path}>{ids.map((id) => <YoutubePlayer key={id} id={id} title={id} transitionName={`recording-${id}`} />)}</div>
  </main></PlaybackProvider>));
}

function play(index = 0) {
  act(() => host.querySelectorAll<HTMLButtonElement>(".youtube-preview")[index].click());
  return host.querySelector("iframe")!;
}

describe("persistent recording playback", () => {
  it("lets the Music to Engineering transition finish before removing the player", async () => {
    renderPage("/music", ["VY-dT_VrC-w"]);
    const player = play();
    renderPage("/music/schumann", ["VY-dT_VrC-w"]);
    renderPage("/music", ["VY-dT_VrC-w"]);
    let finish!: () => void;
    const transition = { finished: new Promise<void>((resolve) => { finish = resolve; }) };
    Object.defineProperty(document, "activeViewTransition", { configurable: true, value: transition });

    renderPage("/work", []);
    await act(async () => {});
    expect(host.querySelector("iframe")).toBe(player);
    expect((host.querySelector(".persistent-player") as HTMLElement).style.visibility).toBe("hidden");
    await act(async () => { finish(); });
    expect(host.querySelector("iframe")).toBeNull();
  });

  it("cancels pending cleanup if the visitor comes back before the animation finishes", async () => {
    renderPage("/music", ["VY-dT_VrC-w"]);
    const player = play();
    let finish!: () => void;
    Object.defineProperty(document, "activeViewTransition", { configurable: true, value: {
      finished: new Promise<void>((resolve) => { finish = resolve; }),
    } });
    renderPage("/work", []);
    renderPage("/music", ["VY-dT_VrC-w"]);
    await act(async () => { finish(); });
    expect(host.querySelector("iframe")).toBe(player);
    expect((host.querySelector(".persistent-player") as HTMLElement).style.visibility).toBe("visible");
  });

  it("waits through snapshot capture in browsers that only expose the active selector", async () => {
    vi.useFakeTimers();
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: vi.fn() });
    let capturing = true;
    vi.spyOn(document.documentElement, "matches").mockImplementation(() => capturing);
    renderPage("/music", ["VY-dT_VrC-w"]);
    const player = play();
    renderPage("/work", []);
    await act(async () => { vi.advanceTimersByTime(64); });
    expect(host.querySelector("iframe")).toBe(player);
    capturing = false;
    await act(async () => { vi.advanceTimersByTime(32); });
    expect(host.querySelector("iframe")).toBeNull();
  });

  it("keeps the same iframe when the recording slot unmounts and returns on another route", () => {
    renderPage("/music", ["VY-dT_VrC-w"]);
    expect(host.querySelector("iframe")).toBeNull();
    const slot = host.querySelector("[data-youtube-slot]");
    const player = play();
    expect(player.src).toContain("VY-dT_VrC-w?autoplay=1");
    expect(slot?.hasAttribute("data-player-active")).toBe(true);
    renderPage("/music/schumann", ["VY-dT_VrC-w"]);
    expect(slot?.isConnected).toBe(false);
    expect(host.querySelector("iframe")).toBe(player);
    expect(host.querySelector("[data-youtube-slot]")?.hasAttribute("data-player-active")).toBe(true);
    renderPage("/music", ["VY-dT_VrC-w"]);
    expect(host.querySelector("iframe")).toBe(player);
  });

  it("replaces the active video when another recording is played and stops on unrelated pages", () => {
    renderPage("/music", ["VY-dT_VrC-w", "IuMpN22O-Ac"]);
    const first = play();
    const second = play(1);
    expect(second).not.toBe(first);
    expect(first.isConnected).toBe(false);
    expect(host.querySelectorAll("iframe")).toHaveLength(1);
    expect(second.src).toContain("IuMpN22O-Ac");
    renderPage("/work", []);
    expect(host.querySelector("iframe")).toBeNull();
    renderPage("/music", ["IuMpN22O-Ac"]);
    expect(host.querySelector("iframe")).toBeNull();
  });

  it("does not strand hidden audio when a graph selection removes the playing slot", async () => {
    renderPage("/", ["VY-dT_VrC-w"]);
    play();
    renderPage("/", []);
    await act(async () => {});
    expect(host.querySelector("iframe")).toBeNull();
  });

  it("can move one playing video between repeated previews without reloading it", () => {
    renderPage("/", ["VY-dT_VrC-w"]);
    // A graph preview can show the same recording as a homepage feature.
    act(() => root.render(<PlaybackProvider><main><PersistentPlayer />
      <YoutubePlayer id="VY-dT_VrC-w" title="Graph preview" />
      <YoutubePlayer id="VY-dT_VrC-w" title="Homepage preview" transitionName="recording-home" />
    </main></PlaybackProvider>));
    const player = play();
    expect(play(1)).toBe(player);
    const slots = host.querySelectorAll("[data-youtube-slot]");
    expect(slots[0].hasAttribute("data-player-active")).toBe(false);
    expect(slots[1].hasAttribute("data-player-active")).toBe(true);
  });
});
