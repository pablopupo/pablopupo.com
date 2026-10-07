// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { finishRecordingReturn, returnToRecordingList } from "./recording-return";

const source = "/music/schumann-abegg-variations";
let host: HTMLDivElement;
let scroll: ReturnType<typeof vi.fn<typeof window.scrollTo>>;

beforeEach(() => {
  window.history.replaceState({ __NA: true }, "", source);
  window.history.scrollRestoration = "auto";
  host = document.createElement("div");
  host.innerHTML = '<div class="route-transition"><article class="recording-page"><h1>Abegg Variations</h1></article></div>';
  document.body.append(host);
  scroll = vi.fn<typeof window.scrollTo>();
  vi.spyOn(window, "scrollTo").mockImplementation(scroll);
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});

afterEach(() => {
  host.remove();
  Reflect.deleteProperty(document, "startViewTransition");
  delete document.documentElement.dataset.navigationInput;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function returnHome() {
  window.history.replaceState({ __NA: true }, "", "/");
  host.innerHTML = `<div class="route-transition"><article class="recording-feature"><h3><a href="${source}">Abegg Variations</a></h3></article></div>`;
  finishRecordingReturn("/");
}

describe("recording return snapshots", () => {
  it("restores scroll and player position before capturing the destination", async () => {
    const aligned = vi.fn();
    window.addEventListener("scroll", aligned);
    const start = vi.fn(({ types, update }: { types: string[]; update: () => Promise<void> }) => {
      expect(types).toEqual(["recording", "recording-return"]);
      expect(host.querySelector<HTMLElement>("h1")!.style.viewTransitionName).toBe("recording-return-title");
      expect(window.history.scrollRestoration).toBe("manual");
      return { finished: update().then(() => {
        expect(scroll).toHaveBeenCalledWith({ left: 0, top: 1450, behavior: "instant" });
        expect(aligned).toHaveBeenCalledOnce();
        expect(host.querySelector<HTMLElement>("h3")!.style.viewTransitionName).toBe("recording-return-title");
        expect(host.querySelector<HTMLElement>(".route-transition")!.style.viewTransitionName).toBe("recording-return-new");
      }) };
    });
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
    await returnToRecordingList({ href: "/", scrollY: 1450 }, returnHome);
    window.removeEventListener("scroll", aligned);
    expect(start).toHaveBeenCalledOnce();
    expect(window.history.scrollRestoration).toBe("auto");
    expect(document.documentElement.hasAttribute("data-recording-return")).toBe(false);
    expect(host.querySelector<HTMLElement>("h3")!.style.viewTransitionName).toBe("");
  });

  it.each(["reduced", "keyboard", "unsupported"])("restores instantly for %s navigation", async (mode) => {
    const start = vi.fn();
    if (mode !== "unsupported") Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
    if (mode === "reduced") vi.stubGlobal("matchMedia", () => ({ matches: true }));
    if (mode === "keyboard") document.documentElement.dataset.navigationInput = "keyboard";
    await returnToRecordingList({ href: "/", scrollY: 1200 }, returnHome);
    expect(start).not.toHaveBeenCalled();
    expect(scroll).toHaveBeenCalledWith({ left: 0, top: 1200, behavior: "instant" });
    expect(window.history.scrollRestoration).toBe("auto");
  });

  it("still navigates if the browser rejects the transition API", async () => {
    Object.defineProperty(document, "startViewTransition", { configurable: true, value: () => { throw new Error("Unsupported options"); } });
    const back = vi.fn(returnHome);
    await returnToRecordingList({ href: "/", scrollY: 1100 }, back);
    expect(back).toHaveBeenCalledOnce();
    expect(scroll).toHaveBeenCalledWith({ left: 0, top: 1100, behavior: "instant" });
  });

  it("does not move back twice on a double click", async () => {
    const back = vi.fn();
    const first = returnToRecordingList({ href: "/", scrollY: 1000 }, back);
    await returnToRecordingList({ href: "/", scrollY: 1000 }, back);
    expect(back).toHaveBeenCalledOnce();
    returnHome();
    await first;
  });
});
