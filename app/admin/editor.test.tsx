import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import Editor, {
  formatDateTimeLocal,
  parseDateTimeLocal,
  parseTagInput,
  nextDocumentGeneration,
  runBusyEditorOperation,
  shouldDiscardUnsavedChanges,
  shouldRestoreRevision,
  unsavedEntryActionMessage,
} from "./editor";

const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalTimeZone;
  vi.unstubAllGlobals();
});

describe("admin editor behavior", () => {
  it("round-trips datetime-local values in a non-UTC timezone", () => {
    process.env.TZ = "America/New_York";
    const stored = "2026-07-22T12:34:00.000Z";

    const local = formatDateTimeLocal(stored);

    expect(local).toBe("2026-07-22T08:34");
    expect(parseDateTimeLocal(local)).toBe(stored);
  });

  it("requires explicit confirmation before discarding dirty editor state", () => {
    const confirmDiscard = vi.fn().mockReturnValue(false);

    expect(shouldDiscardUnsavedChanges(false, confirmDiscard)).toBe(true);
    expect(confirmDiscard).not.toHaveBeenCalled();
    expect(shouldDiscardUnsavedChanges(true, confirmDiscard)).toBe(false);
    expect(confirmDiscard).toHaveBeenCalledOnce();
    expect(unsavedEntryActionMessage(false)).toBeUndefined();
    expect(unsavedEntryActionMessage(true)).toBe(
      "Save changes before using entry actions"
    );
  });

  it("clears busy state and reports a rejected operation", async () => {
    const setBusy = vi.fn();
    const onError = vi.fn();

    await expect(
      runBusyEditorOperation(
        async () => {
          throw new Error("network unavailable");
        },
        setBusy,
        onError
      )
    ).resolves.toBeUndefined();

    expect(setBusy.mock.calls).toEqual([[true], [false]]);
    expect(onError).toHaveBeenCalledWith("Network request failed");
  });

  it("holds busy state until a pending fetch response settles", async () => {
    let resolveResponse: ((response: Response) => void) | undefined;
    const response = new Promise<Response>((resolve) => {
      resolveResponse = resolve;
    });
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(response));
    const busyStates: boolean[] = [];

    const operation = runBusyEditorOperation(
      async () => (await fetch("https://example.com/api/admin/entries")).status,
      (busy) => busyStates.push(busy),
      vi.fn()
    );

    expect(busyStates).toEqual([true]);
    resolveResponse?.(new Response(null, { status: 204 }));
    await expect(operation).resolves.toBe(204);
    expect(busyStates).toEqual([true, false]);
  });

  it("keeps raw tag input editable while producing normalized mutation tags", () => {
    expect(parseTagInput("")).toEqual([]);
    expect(parseTagInput("Music,")).toEqual(["Music"]);
    expect(parseTagInput(" Music, Live performance , ")).toEqual([
      "Music",
      "Live performance",
    ]);
  });

  it("bumps the editor document generation only for replacement content", () => {
    expect(nextDocumentGeneration(4, false)).toBe(4);
    expect(nextDocumentGeneration(4, true)).toBe(5);
  });

  it("requires explicit confirmation before restoring a revision", () => {
    const confirmRestore = vi.fn().mockReturnValue(false);

    expect(shouldRestoreRevision(7, confirmRestore)).toBe(false);
    expect(confirmRestore).toHaveBeenCalledWith(
      "Restore revision 7? Current content will become a new revision."
    );
  });
});

describe("admin editor states", () => {
  it("shows missing configuration without asking for a password", () => {
    const html = renderToStaticMarkup(
      <Editor
        mode="unconfigured"
        configurationStatus={{
          configured: false,
          missing: ["DATABASE_URL", "ADMIN_GITHUB_ID"],
          invalid: [],
        }}
      />
    );

    expect(html).toContain("Admin configuration is incomplete");
    expect(html).toContain("DATABASE_URL");
    expect(html).toContain("ADMIN_GITHUB_ID");
    expect(html).not.toContain('type="password"');
  });

  it("offers only GitHub sign-in to a signed-out visitor", () => {
    const html = renderToStaticMarkup(<Editor mode="signed-out" />);

    expect(html).toContain("Sign in with GitHub");
    expect(html).not.toContain('type="password"');
  });

  it("shows the owner boundary when a non-owner session is present", () => {
    const html = renderToStaticMarkup(<Editor mode="forbidden" />);

    expect(html).toContain("does not match the configured owner");
    expect(html).toContain("Sign out");
  });

  it("renders section, tags, rich/raw Markdown, and every entry workflow for the owner", () => {
    const html = renderToStaticMarkup(<Editor mode="authorized" />);

    for (const label of [
      "New entry",
      "Title",
      "Slug",
      "Summary",
      "Kind",
      "Section",
      "Tags",
      "Rich Markdown",
      "Raw Markdown",
      "Loading rich editor",
      "Save",
      "Publish now",
      "Schedule",
      "Unpublish",
      "Archive",
      "Duplicate",
      "Delete",
      "Sign out",
    ]) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain("<main");
  });
});
