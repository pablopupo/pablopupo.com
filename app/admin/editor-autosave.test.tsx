// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import Editor from "./editor";

vi.mock("next/dynamic", () => ({ default: (_loader: unknown, options: { loading: () => React.ReactNode }) => options.loading }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | undefined;
let container: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); container?.remove(); window.history.replaceState({}, "", "/"); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
async function mount() {
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => { root?.render(<Editor mode="authorized" />); });
}
function typeTitle(value: string) {
  const input = container.querySelector<HTMLInputElement>('.studio-title input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
function typeField(label: string, value: string) {
  const input = [...container.querySelectorAll("label")].find((item) => item.textContent?.trim() === label)?.querySelector("input");
  expect(input, label).toBeTruthy();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input!.dispatchEvent(new Event("input", { bubbles: true }));
}
function clickButton(label: string) {
  const button = [...container.querySelectorAll("button")].find((item) => item.textContent?.trim() === label);
  expect(button, label).toBeTruthy();
  button!.click();
}

describe("writing studio autosave", () => {
  it("opens a linked recording and saves its edited date without changing publication time", async () => {
    const recording = { id: "recording", slug: "recital", kind: "performance", section: "music", status: "published", title: "Recital", tags: [], bodyMarkdown: "", version: 4, publishedAt: "2026-09-14T00:00:00.000Z", performance: { workTitle: "Abegg Variations", composer: "Robert Schumann", youtubeUrl: "https://www.youtube.com/watch?v=VY-dT_VrC-w", performedAt: "2023-11-30T00:00:00.000Z", venue: "UF School of Music" } };
    const fetcher = vi.fn((url: string, init?: RequestInit) => Promise.resolve(json(
      init?.method === "PATCH" ? { entry: { ...recording, ...JSON.parse(String(init.body)).entry, version: 5 } } :
      url.endsWith("/revisions") ? { revisions: [] } : url === "/api/admin/entries" ? { entries: [recording] } : { entry: recording }
    )));
    vi.stubGlobal("fetch", fetcher);
    window.history.replaceState({}, "", "/admin?entry=recital");
    await mount();
    const date = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    expect(date.value).toBe("2023-11-30");
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(date, "2023-12-01");
      date.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => clickButton("Save"));
    const save = fetcher.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(save?.[1]?.body))).toMatchObject({ expectedVersion: 4, entry: { publishedAt: "2026-09-14T00:00:00.000Z", performance: { performedAt: "2023-12-01T00:00:00.000Z" } } });
  });

  it("saves a recording with a reusable series and preserves names and normal tags while typing", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn((url: string, init?: RequestInit): Promise<Response> => {
      if (init?.method === "POST") {
        return Promise.resolve(json({ entry: { ...JSON.parse(String(init.body)), id: "recording-1", version: 1, updatedAt: new Date().toISOString() } }));
      }
      if (url.endsWith("/revisions")) return Promise.resolve(json({ revisions: [] }));
      return Promise.resolve(json({ entries: [] }));
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    act(() => clickButton("New recording"));
    act(() => typeTitle("An evening recording"));
    act(() => typeField("Series name", "Weekly "));
    expect(container.querySelector<HTMLInputElement>('[list="studio-series-names"]')?.value).toBe("Weekly ");
    act(() => typeField("Series name", "Weekly recordings"));
    act(() => typeField("Post order (optional)", "2"));
    act(() => typeField("Tags", "piano, "));
    expect([...container.querySelectorAll("label")].find((item) => item.textContent === "Tags")?.querySelector("input")?.value).toBe("piano, ");
    act(() => typeField("Tags", "piano, practice"));
    act(() => typeField("Work title", "A piano piece"));
    act(() => typeField("Composer", "Composer name"));
    act(() => typeField("YouTube URL", "https://www.youtube.com/watch?v=M7lc1UVf-VE"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    const creates = fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(creates).toHaveLength(1);
    expect(JSON.parse(String(creates[0][1]?.body))).toMatchObject({ kind: "performance", section: "music", tags: ["piano", "practice", "series:Weekly recordings", "part:2"], performance: { workTitle: "A piano piece", composer: "Composer name" } });
    expect(container.querySelector<HTMLInputElement>('[list="studio-series-names"]')?.value).toBe("Weekly recordings");
    act(() => clickButton("Engineering post"));
    act(() => typeTitle("A retrieval experiment"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    const lastCreate = fetcher.mock.calls.filter(([, init]) => init?.method === "POST").at(-1);
    expect(JSON.parse(String(lastCreate?.[1]?.body))).toMatchObject({ kind: "note", section: "writing", tags: ["engineering"] });
    expect(container.querySelector<HTMLInputElement>('[list="studio-series-names"]')?.value).toBe("");
  });

  it("creates one private draft, then preserves edits made during its first save", async () => {
    vi.useFakeTimers();
    let completeCreate: ((value: Response) => void) | undefined;
    const fetcher = vi.fn((url: string, init?: RequestInit): Promise<Response> => {
      if (init?.method === "POST") return new Promise((resolve) => { completeCreate = resolve; });
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return Promise.resolve(json({ entry: { ...body.entry, id: "draft-1", version: 2, updatedAt: new Date().toISOString() } }));
      }
      if (url.endsWith("/revisions")) return Promise.resolve(json({ revisions: [] }));
      return Promise.resolve(json({ entries: [] }));
    });
    vi.stubGlobal("fetch", fetcher);
    await mount();
    act(() => typeTitle("A score question"));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    const creates = fetcher.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(creates).toHaveLength(1);
    const submitted = JSON.parse(String(creates[0][1]?.body));
    expect(submitted).toMatchObject({ title: "A score question", slug: "a-score-question" });
    act(() => typeTitle("A better score question"));
    await act(async () => { completeCreate?.(json({ entry: { ...submitted, id: "draft-1", status: "draft", version: 1, updatedAt: new Date().toISOString() } })); });
    expect(container.querySelector<HTMLInputElement>('.studio-title input')?.value).toBe("A better score question");
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    const patches = fetcher.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(patches).toHaveLength(1);
    expect(JSON.parse(String(patches[0][1]?.body))).toMatchObject({ entry: { title: "A better score question" }, expectedVersion: 1 });
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    expect(fetcher.mock.calls.some(([url]) => url.endsWith("/actions"))).toBe(false);
  });

  it("resumes the latest draft without loading a published article", async () => {
    const items = [
      { id: "old", title: "Older draft", slug: "older", status: "draft", updatedAt: "2026-09-10" },
      { id: "live", title: "Published", slug: "published", status: "published", updatedAt: "2026-09-15" },
      { id: "recent", title: "Latest draft", slug: "latest", status: "draft", updatedAt: "2026-09-14" },
    ];
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(json(url.endsWith("/revisions") ? { revisions: [] } : url === "/api/admin/entries" ? { entries: items } : { entry: items.find((item) => url.endsWith(item.id)) }))));
    await mount();
    expect(container.querySelector<HTMLInputElement>('.studio-title input')?.value).toBe("Latest draft");
  });
});
