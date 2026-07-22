import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import MarkdownEditor, {
  nextMarkdownMode,
  selectMarkdownSnapshot,
  shouldSyncRichEditor,
} from "./markdown-editor";

describe("Markdown editor shell", () => {
  it("renders a client-only rich editor fallback and an explicit raw toggle", () => {
    const html = renderToStaticMarkup(
      <MarkdownEditor
        documentKey="new"
        value="# Draft"
        onChange={vi.fn()}
        onDirty={vi.fn()}
        snapshotRef={{ current: () => "# Draft" }}
      />
    );

    expect(html).toContain("Loading rich editor");
    expect(html).toContain("Rich Markdown");
    expect(html).toContain("Raw Markdown");
    expect(html).toContain('aria-pressed="true"');
    expect(html).not.toContain("<textarea");
  });

  it("syncs the existing rich instance only when returning from raw mode", () => {
    expect(nextMarkdownMode("rich")).toBe("raw");
    expect(nextMarkdownMode("raw")).toBe("rich");
    expect(shouldSyncRichEditor("raw", "rich")).toBe(true);
    expect(shouldSyncRichEditor("rich", "raw")).toBe(false);
  });

  it("reads a synchronous rich snapshot for an immediate save", () => {
    const currentRichMarkdown = vi.fn().mockReturnValue("# Latest keystroke");

    expect(
      selectMarkdownSnapshot("rich", "# Delayed React value", currentRichMarkdown)
    ).toBe("# Latest keystroke");
    expect(
      selectMarkdownSnapshot("raw", "# Current raw value", currentRichMarkdown)
    ).toBe("# Current raw value");
    expect(currentRichMarkdown).toHaveBeenCalledOnce();
    expect(currentRichMarkdown).toHaveBeenCalledWith(true);

    selectMarkdownSnapshot(
      "rich",
      "# Delayed React value",
      currentRichMarkdown,
      false
    );
    expect(currentRichMarkdown).toHaveBeenLastCalledWith(false);
  });
});
