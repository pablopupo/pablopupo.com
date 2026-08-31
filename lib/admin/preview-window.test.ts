import { describe, expect, it, vi } from "vitest";
import { preparePreviewWindow } from "./preview-window";

describe("preview window lifecycle", () => {
  it("reserves a tab during the click and navigates it only after saving", () => {
    const replace = vi.fn();
    const close = vi.fn();
    const popup = {
      location: { replace },
      close,
      opener: {} as unknown,
    };
    const browser = {
      open: vi.fn().mockReturnValue(popup),
      location: { assign: vi.fn() },
    };

    const preview = preparePreviewWindow(browser);

    expect(browser.open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(popup.opener).toBeNull();
    expect(replace).not.toHaveBeenCalled();

    preview.show("/admin/preview/entries/entry-id");

    expect(replace).toHaveBeenCalledWith(
      "/admin/preview/entries/entry-id"
    );
    expect(browser.location.assign).not.toHaveBeenCalled();
  });

  it("closes the reserved tab when saving fails", () => {
    const popup = {
      location: { replace: vi.fn() },
      close: vi.fn(),
      opener: null,
    };
    const preview = preparePreviewWindow({
      open: vi.fn().mockReturnValue(popup),
      location: { assign: vi.fn() },
    });

    preview.cancel();

    expect(popup.close).toHaveBeenCalledOnce();
    expect(popup.location.replace).not.toHaveBeenCalled();
  });

  it("falls back to the current tab only after a successful save", () => {
    const assign = vi.fn();
    const preview = preparePreviewWindow({
      open: vi.fn().mockReturnValue(null),
      location: { assign },
    });

    expect(assign).not.toHaveBeenCalled();

    preview.show("/admin/preview/work/project-id");

    expect(assign).toHaveBeenCalledWith("/admin/preview/work/project-id");
  });
});
