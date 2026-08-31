// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import Editor from "./editor";

vi.mock("next/dynamic", () => ({
  default: (
    _loader: unknown,
    options: { loading: () => React.ReactNode }
  ) => options.loading,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const entryId = "11111111-1111-4111-8111-111111111111";

const entry = {
  id: entryId,
  slug: "clinical-evaluation-notes",
  kind: "note",
  section: "writing",
  tags: ["evaluation"],
  status: "draft",
  title: "Clinical evaluation notes",
  summary: "What changed after testing the first workflow.",
  bodyMarkdown: "Saved notes.",
  publishedAt: null,
  updatedAt: "2026-08-06T13:30:00.000Z",
  version: 3,
  performance: null,
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  root = null;
  container = null;
});

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function buttonByText(text: string) {
  return [
    ...(container?.querySelectorAll<HTMLButtonElement>("button") ?? []),
  ].find((button) => button.textContent?.trim() === text);
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("entry preview action", () => {
  it("cancels the reserved preview when the schedule changes during saving", async () => {
    let resolveSave: ((response: Response) => void) | undefined;
    const pendingSave = new Promise<Response>((resolve) => {
      resolveSave = resolve;
    });
    const fetcher = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/admin/entries/${entryId}` && init?.method === "PATCH") {
        return pendingSave;
      }
      if (url === `/api/admin/entries/${entryId}`) {
        return Promise.resolve(jsonResponse({ entry }));
      }
      if (url === `/api/admin/entries/${entryId}/revisions`) {
        return Promise.resolve(jsonResponse({ revisions: [] }));
      }
      if (url === "/api/admin/entries") {
        return Promise.resolve(jsonResponse({ entries: [entry] }));
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const replace = vi.fn();
    const close = vi.fn();
    const open = vi.spyOn(window, "open").mockReturnValue({
      location: { replace },
      close,
      opener: null,
    } as unknown as Window);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<Editor mode="authorized" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      [
        ...(container?.querySelectorAll<HTMLButtonElement>("aside button") ?? []),
      ]
        .find((button) => button.textContent?.includes(entry.title))
        ?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const previewButton = buttonByText("Save & Preview");
    expect(previewButton).not.toBeUndefined();
    expect(previewButton?.disabled).toBe(false);
    act(() => previewButton?.click());
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(resolveSave).toBeTypeOf("function");
    expect(fetcher).toHaveBeenCalledWith(
      `/api/admin/entries/${entryId}`,
      expect.objectContaining({ method: "PATCH" })
    );
    const scheduleInput = container.querySelector<HTMLInputElement>(
      'input[type="datetime-local"]'
    );
    expect(scheduleInput).not.toBeNull();
    act(() => setInputValue(scheduleInput!, "2026-08-21T09:00"));
    expect(scheduleInput?.value).toBe("2026-08-21T09:00");

    await act(async () => {
      resolveSave?.(jsonResponse({ entry }));
      await pendingSave;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(replace).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
