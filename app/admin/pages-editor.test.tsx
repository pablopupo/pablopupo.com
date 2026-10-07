// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import PagesEditor from "./pages-editor";

vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
async function mount() {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root?.render(<PagesEditor />));
}
function button(text: string) { return [...container.querySelectorAll("button")].find((item) => item.textContent?.replace(" •", "").trim() === text)!; }
function field(text: string) { return [...container.querySelectorAll("label")].find((item) => item.firstChild?.textContent === text)!.querySelector("textarea")!; }
function edit(label: string, value: string) {
  const input = field(label);
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
async function save() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }

describe("page editing", () => {
  it("keeps edits across page selection, previews them, and saves only changed fields", async () => {
    let record = { version: 6, headline: "AI engineer", pageCopy: { musicIntro: "Weekly recordings." } };
    const fetcher = vi.fn((_url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") record = { ...record, version: 7, pageCopy: { ...record.pageCopy, ...JSON.parse(String(init.body)).settings.pageCopy } };
      return Promise.resolve(json({ settings: record }));
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    act(() => edit("AI & Software introduction", "What I am building."));
    act(() => button("Music").click());
    expect(field("Music page introduction").value).toBe("Weekly recordings.");
    act(() => edit("Music page introduction", "Recordings and reflections."));
    expect(container.querySelector('[aria-label="Text preview"]')?.textContent).toContain("Recordings and reflections.");
    act(() => button("Home").click());
    expect(field("AI & Software introduction").value).toBe("What I am building.");
    await save();
    const mutation = fetcher.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(mutation?.[1]?.body))).toEqual({ expectedVersion: 6, settings: { pageCopy: { homeEngineeringIntro: "What I am building.", musicIntro: "Recordings and reflections." } } });
    expect(container.textContent).toContain("Saved. Your changes are now on the site.");
    expect(button("Save changes").disabled).toBe(true);
    act(() => root?.unmount());
    await mount();
    expect(field("AI & Software introduction").value).toBe("What I am building.");
  });

  it("preserves unsaved text on a stale-version conflict and blocks accidental overwrite", async () => {
    vi.stubGlobal("fetch", vi.fn((_url, init) => Promise.resolve(init?.method === "PATCH" ? json({ error: "changed" }, 409) : json({ settings: { version: 3, pageCopy: {} } }))));
    await mount();
    act(() => edit("AI & Software introduction", "My unsaved text"));
    await save();
    expect(field("AI & Software introduction").value).toBe("My unsaved text");
    expect(container.textContent).toContain("edited in another tab");
    act(() => edit("AI & Software introduction", "Keep this too"));
    expect(button("Save changes").disabled).toBe(true);
    expect(button("Reload saved text")).toBeTruthy();
  });

  it("retains a cleared optional introduction and permits retry after a failed save", async () => {
    let fail = true;
    vi.stubGlobal("fetch", vi.fn((_url, init) => Promise.resolve(init?.method === "PATCH"
      ? fail ? json({ error: "Temporary error" }, 500) : json({ settings: { version: 2, pageCopy: { homeEngineeringIntro: "" } } })
      : json({ settings: { version: 1, pageCopy: {} } }))));
    await mount();
    act(() => edit("AI & Software introduction", ""));
    await save();
    expect(field("AI & Software introduction").value).toBe("");
    expect(button("Save changes").disabled).toBe(false);
    fail = false;
    await save();
    expect(field("AI & Software introduction").value).toBe("");
    expect(button("Save changes").disabled).toBe(true);
  });

  it("does not permit saving defaults when loading failed", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: "unauthenticated" }, 401)));
    await mount();
    expect(button("Save changes").disabled).toBe(true);
    expect(field("AI & Software introduction").disabled).toBe(true);
    expect(button("Try again")).toBeTruthy();
  });
});
