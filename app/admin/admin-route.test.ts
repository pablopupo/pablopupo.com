import { describe, expect, it, vi } from "vitest";
import { resolveAdminRouteState } from "./admin-route";

const configured = {
  configured: true,
  missing: [],
  invalid: [],
};

describe("admin route access", () => {
  it("returns configuration details without checking a session", async () => {
    const authorize = vi.fn();

    await expect(
      resolveAdminRouteState(
        { configured: false, missing: ["DATABASE_URL"], invalid: [] },
        new Headers(),
        authorize
      )
    ).resolves.toEqual({
      mode: "unconfigured",
      configurationStatus: {
        configured: false,
        missing: ["DATABASE_URL"],
        invalid: [],
      },
    });
    expect(authorize).not.toHaveBeenCalled();
  });

  it.each([
    ["unauthenticated", "signed-out"],
    ["forbidden", "forbidden"],
    ["unconfigured", "unconfigured"],
    ["authorized", "authorized"],
  ] as const)("maps %s access to %s", async (status, mode) => {
    const requestHeaders = new Headers({ cookie: "session=owner" });
    const authorize = vi.fn().mockResolvedValue({ status });

    const state = await resolveAdminRouteState(
      configured,
      requestHeaders,
      authorize
    );

    expect(state.mode).toBe(mode);
    expect(authorize).toHaveBeenCalledWith(requestHeaders);
  });
});
