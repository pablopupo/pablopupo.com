// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CopyEmail from "./copy-email";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function mount() {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  act(() => root!.render(<CopyEmail email="hello@example.com" />));
}

describe("copy email feedback", () => {
  it("confirms the copy only after the clipboard succeeds, then resets", async () => {
    vi.useFakeTimers();
    let resolveCopy: () => void = () => {};
    const writeText = vi.fn(() => new Promise<void>((resolve) => { resolveCopy = resolve; }));
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mount();
    act(() => container.querySelector("button")!.click());
    expect(container.querySelector('[role="status"]')!.textContent).toBe("");
    await act(async () => resolveCopy());
    expect(writeText).toHaveBeenCalledWith("hello@example.com");
    expect(container.querySelector('[role="status"]')!.textContent).toBe("Email copied");
    act(() => vi.advanceTimersByTime(4000));
    expect(container.querySelector('[role="status"]')!.textContent).toBe("");
  });

  it.each([undefined, { writeText: () => Promise.reject(new Error("Permission denied")) }])("provides the address for manual copying when the clipboard is unavailable", async (clipboard) => {
    vi.stubGlobal("navigator", { clipboard });
    mount();
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector('[role="status"]')!.textContent).toBe("Couldn’t copy. Select the address: hello@example.com");
    expect(container.textContent).not.toContain("Email copied");
  });
});
