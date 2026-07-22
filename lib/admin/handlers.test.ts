import { describe, expect, it, vi } from "vitest";
import { EntryConflictError, EntryStateError } from "./repository";

const entryId = "11111111-1111-4111-8111-111111111111";

function request(method: string, body?: unknown, origin = "https://example.com") {
  return new Request("https://example.com/api/admin/entries", {
    method,
    headers: {
      origin,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    authorize: vi.fn().mockResolvedValue({ status: "authorized", userId: "user-1" }),
    isSameOrigin: vi.fn().mockReturnValue(true),
    now: vi.fn().mockReturnValue(new Date("2026-07-22T12:00:00Z")),
    revalidate: vi.fn(),
    repository: {
      listEntries: vi.fn().mockResolvedValue([]),
      createDraft: vi.fn().mockResolvedValue({ id: entryId, version: 1 }),
      getEntry: vi.fn().mockResolvedValue({
        id: entryId,
        slug: "entry-one",
        kind: "note",
        status: "draft",
        title: "Entry one",
        summary: null,
        bodyMarkdown: "Body",
        publishedAt: null,
        version: 1,
        performance: null,
      }),
      updateEntry: vi.fn().mockResolvedValue({ id: entryId, version: 2 }),
      transitionEntry: vi.fn().mockResolvedValue({ id: entryId, version: 2 }),
      duplicateEntry: vi.fn().mockResolvedValue({ id: "entry-copy", version: 1 }),
      deleteEntry: vi.fn().mockResolvedValue(true),
    },
    ...overrides,
  };
}

async function setupHandlers(overrides: Record<string, unknown> = {}) {
  const module = await import("./handlers").catch(() => undefined);
  expect(module).toBeDefined();
  expect(module?.createAdminEntryHandlers).toBeTypeOf("function");
  const deps = dependencies(overrides);
  return { deps, handlers: module!.createAdminEntryHandlers(deps) };
}

describe("admin entry handler authorization", () => {
  it.each([
    ["unconfigured", 503],
    ["unauthenticated", 401],
    ["forbidden", 403],
  ])("maps %s access to %i", async (status, expectedStatus) => {
    const { handlers } = await setupHandlers({
      authorize: vi.fn().mockResolvedValue({ status }),
    });

    const response = await handlers.list(request("GET"));

    expect(response.status).toBe(expectedStatus);
  });

  it("rejects a mutation that lacks an explicit same-origin result", async () => {
    const { deps, handlers } = await setupHandlers({
      isSameOrigin: vi.fn().mockReturnValue(false),
    });

    const response = await handlers.create(request("POST", {
      slug: "new-entry",
      title: "New entry",
    }));

    expect(response.status).toBe(403);
    expect(deps.repository.createDraft).not.toHaveBeenCalled();
  });
});

describe("admin entry handler status mapping", () => {
  it("returns 422 for a malformed entry ID before querying Postgres", async () => {
    const { deps, handlers } = await setupHandlers();

    const response = await handlers.load(request("GET"), "not-a-uuid");

    expect(response.status).toBe(422);
    expect(deps.repository.getEntry).not.toHaveBeenCalled();
  });

  it("returns 422 for malformed entry input", async () => {
    const { handlers } = await setupHandlers();

    const response = await handlers.create(request("POST", { title: "Missing slug" }));

    expect(response.status).toBe(422);
  });

  it("returns 409 for an optimistic version conflict", async () => {
    const deps = dependencies();
    deps.repository.updateEntry.mockRejectedValue(
      new EntryConflictError("Entry version is stale")
    );
    const module = await import("./handlers").catch(() => undefined);
    expect(module?.createAdminEntryHandlers).toBeTypeOf("function");
    const entryHandlers = module!.createAdminEntryHandlers(deps);

    const response = await entryHandlers.update(
      request("PATCH", {
        expectedVersion: 1,
        entry: {
          slug: "entry-one",
          kind: "note",
          status: "draft",
          title: "Entry one",
          summary: null,
          bodyMarkdown: "Body",
          publishedAt: null,
          performance: null,
        },
      }),
      entryId
    );

    expect(response.status).toBe(409);
  });

  it("returns 422 for an invalid state transition", async () => {
    const deps = dependencies();
    deps.repository.transitionEntry.mockRejectedValue(
      new EntryStateError("Schedule must be in the future")
    );
    const module = await import("./handlers").catch(() => undefined);
    expect(module?.createAdminEntryHandlers).toBeTypeOf("function");
    const entryHandlers = module!.createAdminEntryHandlers(deps);

    const response = await entryHandlers.action(
      request("POST", {
        action: "schedule",
        expectedVersion: 1,
        scheduledAt: "2026-08-01T12:00:00Z",
      }),
      entryId
    );

    expect(response.status).toBe(422);
  });

  it("requires the current slug as explicit delete confirmation", async () => {
    const { deps, handlers } = await setupHandlers();

    const response = await handlers.remove(
      request("DELETE", { expectedVersion: 1, confirmation: "wrong-slug" }),
      entryId
    );

    expect(response.status).toBe(422);
    expect(deps.repository.deleteEntry).not.toHaveBeenCalled();
  });

  it("invalidates caches after successful create, update, action, duplicate, and delete", async () => {
    const { deps, handlers } = await setupHandlers();
    const entry = {
      slug: "entry-one",
      kind: "note",
      status: "draft",
      title: "Entry one",
      summary: null,
      bodyMarkdown: "Body",
      publishedAt: null,
      performance: null,
    };

    expect(
      (await handlers.create(
        request("POST", {
          slug: entry.slug,
          kind: entry.kind,
          title: entry.title,
          summary: entry.summary,
          bodyMarkdown: entry.bodyMarkdown,
          performance: entry.performance,
        })
      )).status
    ).toBe(201);
    expect(
      (await handlers.update(
        request("PATCH", { expectedVersion: 1, entry }),
        entryId
      )).status
    ).toBe(200);
    expect(
      (await handlers.action(
        request("POST", { action: "publish", expectedVersion: 2 }),
      entryId
      )).status
    ).toBe(200);
    expect(
      (await handlers.action(request("POST", { action: "duplicate" }), entryId))
        .status
    ).toBe(201);
    expect(
      (await handlers.remove(
        request("DELETE", { expectedVersion: 1, confirmation: "entry-one" }),
        entryId
      )).status
    ).toBe(204);
    expect(deps.revalidate).toHaveBeenCalledTimes(5);
  });
});
