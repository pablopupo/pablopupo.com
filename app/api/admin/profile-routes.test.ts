import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: {
    load: vi.fn(),
    update: vi.fn(),
  },
  media: {
    list: vi.fn(),
    upload: vi.fn(),
  },
  withAdminSettingsHandlers: vi.fn(),
  withAdminMediaHandlers: vi.fn(),
}));

vi.mock("@/lib/admin/server", () => ({
  withAdminSettingsHandlers: mocks.withAdminSettingsHandlers,
  withAdminMediaHandlers: mocks.withAdminMediaHandlers,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settings.load.mockResolvedValue(Response.json({ settings: {} }));
  mocks.settings.update.mockResolvedValue(Response.json({ settings: {} }));
  mocks.media.list.mockResolvedValue(Response.json({ media: [] }));
  mocks.media.upload.mockResolvedValue(Response.json({ media: {} }, { status: 201 }));
  mocks.withAdminSettingsHandlers.mockImplementation(
    (operation: (handlers: typeof mocks.settings) => Promise<Response>) =>
      operation(mocks.settings)
  );
  mocks.withAdminMediaHandlers.mockImplementation(
    (operation: (handlers: typeof mocks.media) => Promise<Response>) =>
      operation(mocks.media)
  );
});

describe("admin profile API routes", () => {
  it("delegates settings GET and PATCH with the original request", async () => {
    const route = await import("./settings/route").catch(() => undefined);
    expect(route?.GET).toBeTypeOf("function");
    expect(route?.PATCH).toBeTypeOf("function");
    const getRequest = new Request("https://example.com/api/admin/settings");
    const patchRequest = new Request("https://example.com/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify({ expectedVersion: 1, settings: { location: "Miami, Florida" } }),
    });

    await route!.GET(getRequest);
    await route!.PATCH(patchRequest);

    expect(mocks.settings.load).toHaveBeenCalledWith(getRequest);
    expect(mocks.settings.update).toHaveBeenCalledWith(patchRequest);
  });

  it("delegates media GET and POST with the original request", async () => {
    const route = await import("./media/route").catch(() => undefined);
    expect(route?.GET).toBeTypeOf("function");
    expect(route?.POST).toBeTypeOf("function");
    const getRequest = new Request("https://example.com/api/admin/media");
    const postRequest = new Request("https://example.com/api/admin/media", {
      method: "POST",
      body: new FormData(),
    });

    await route!.GET(getRequest);
    await route!.POST(postRequest);

    expect(mocks.media.list).toHaveBeenCalledWith(getRequest);
    expect(mocks.media.upload).toHaveBeenCalledWith(postRequest);
  });
});
