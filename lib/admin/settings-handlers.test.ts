import { describe, expect, it, vi } from "vitest";

function request(method: string, body?: unknown, origin = "https://example.com") {
  return new Request("https://example.com/api/admin/settings", {
    method,
    headers: {
      origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function settings() {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    siteTitle: "Pablo Pupo",
    headline: "Software Engineer, Applied AI",
    location: "Miami, Florida",
    graduationOn: "2026-12-01",
    introMarkdown: "Applied AI systems and classical piano.",
    aboutMarkdown: "About Pablo.",
    contactEmail: "pablofpupo23@gmail.com",
    githubUrl: "https://github.com/pablopupo",
    linkedinUrl: "https://linkedin.com/in/pablopupo",
    youtubeUrl: null,
    avatarMediaId: "22222222-2222-4222-8222-222222222222",
    resumeMediaId: "33333333-3333-4333-8333-333333333333",
    version: 1,
    avatarMedia: null,
    resumeMedia: null,
  };
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authorize: vi.fn().mockResolvedValue({ status: "authorized", userId: "user-1" }),
    isSameOrigin: vi.fn().mockReturnValue(true),
    revalidate: vi.fn(),
    repository: {
      getSettings: vi.fn().mockResolvedValue(settings()),
      updateSettings: vi.fn().mockResolvedValue({ ...settings(), version: 2 }),
    },
    ...overrides,
  };
}

async function setup(overrides: Record<string, unknown> = {}) {
  const module = await import("./settings-handlers").catch(() => undefined);
  expect(module?.createAdminSettingsHandlers).toBeTypeOf("function");
  const deps = dependencies(overrides);
  return {
    deps,
    handlers: module!.createAdminSettingsHandlers(deps),
  };
}

describe("admin settings handlers", () => {
  it.each([
    ["unconfigured", 503],
    ["unauthenticated", 401],
    ["forbidden", 403],
  ])("maps %s access to %i", async (status, expectedStatus) => {
    const { handlers } = await setup({
      authorize: vi.fn().mockResolvedValue({ status }),
    });

    const response = await handlers.load(request("GET"));

    expect(response.status).toBe(expectedStatus);
  });

  it("returns the singleton settings record", async () => {
    const { handlers } = await setup();

    const response = await handlers.load(request("GET"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ settings: settings() });
  });

  it("requires same-origin before updating settings", async () => {
    const deps = dependencies({ isSameOrigin: vi.fn().mockReturnValue(false) });
    const module = await import("./settings-handlers").catch(() => undefined);
    expect(module?.createAdminSettingsHandlers).toBeTypeOf("function");
    const handlers = module!.createAdminSettingsHandlers(deps);

    const response = await handlers.update(
      request("PATCH", { expectedVersion: 1, settings: { headline: "Changed" } })
    );

    expect(response.status).toBe(403);
    expect(deps.repository.updateSettings).not.toHaveBeenCalled();
  });

  it.each([
    [{ expectedVersion: 1, settings: {} }, "an empty patch"],
    [{ expectedVersion: 1, settings: { siteTitle: "" } }, "an empty title"],
    [{ expectedVersion: 1, settings: { headline: "x".repeat(161) } }, "a long headline"],
    [{ expectedVersion: 1, settings: { contactEmail: "not-an-email" } }, "an invalid email"],
    [{ expectedVersion: 1, settings: { githubUrl: "not a URL" } }, "a malformed URL"],
    [{ expectedVersion: 1, settings: { githubUrl: "ftp://github.com/pablopupo" } }, "a non-http URL"],
    [{ expectedVersion: 0, settings: { location: "Miami, Florida" } }, "a non-positive version"],
    [{ expectedVersion: 1, settings: { graduationOn: "December 2026" } }, "a malformed date"],
    [{ expectedVersion: 1, settings: { extra: true } }, "an unknown field"],
    [
      { expectedVersion: 1, settings: { headline: "Changed", extra: true } },
      "an unknown field beside a valid field",
    ],
  ])("returns 422 for %s", async (body, _description) => {
    const { deps, handlers } = await setup();

    const response = await handlers.update(request("PATCH", body));

    expect(response.status).toBe(422);
    expect(deps.repository.updateSettings).not.toHaveBeenCalled();
  });

  it("updates validated nullable profile fields with optimistic concurrency", async () => {
    const { deps, handlers } = await setup();
    const settingsPatch = {
      siteTitle: "Pablo Pupo",
      headline: "Software Engineer, Applied AI",
      location: "Miami, Florida",
      graduationOn: "2026-12-01",
      introMarkdown: "I build applied AI systems and play classical piano.",
      aboutMarkdown: "I study computer science at the University of Florida.",
      contactEmail: "pablofpupo23@gmail.com",
      githubUrl: "https://github.com/pablopupo",
      linkedinUrl: "https://linkedin.com/in/pablopupo",
      youtubeUrl: null,
      avatarMediaId: "22222222-2222-4222-8222-222222222222",
      resumeMediaId: "33333333-3333-4333-8333-333333333333",
    };

    const response = await handlers.update(
      request("PATCH", { expectedVersion: 1, settings: settingsPatch })
    );

    expect(response.status).toBe(200);
    expect(deps.repository.updateSettings).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        location: "Miami, Florida",
        graduationOn: "2026-12-01",
        youtubeUrl: null,
      })
    );
    expect(deps.revalidate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["SettingsConflictError", 409, "settings changed in another session"],
    ["SettingsMediaTypeError", 422, "avatar media must be an image"],
    ["SettingsNotFoundError", 404, "settings not found"],
  ])("maps %s repository errors", async (name, status, message) => {
    const error = new Error(message);
    error.name = name;
    const deps = dependencies();
    deps.repository.updateSettings.mockRejectedValue(error);
    const module = await import("./settings-handlers").catch(() => undefined);
    expect(module?.createAdminSettingsHandlers).toBeTypeOf("function");
    const handlers = module!.createAdminSettingsHandlers(deps);

    const response = await handlers.update(
      request("PATCH", { expectedVersion: 1, settings: { headline: "Changed" } })
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ error: message });
  });
});
