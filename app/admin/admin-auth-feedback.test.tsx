// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminAccessState, AdminShell } from "./admin-shell";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ authClient: { signIn: { social: mocks.signIn }, signOut: mocks.signOut } }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
let container: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); container?.remove(); vi.resetAllMocks(); });

async function mount(children: React.ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(children));
}

describe("Studio authentication feedback", () => {
  it("shows a returned sign-in error and allows another attempt", async () => {
    mocks.signIn.mockResolvedValue({ error: { message: "Invalid origin" }, data: null });
    await mount(<AdminAccessState state={{ mode: "signed-out" }} />);
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Invalid origin");
    expect(container.querySelector("button")?.disabled).toBe(false);
  });

  it("recovers from a rejected sign-in request", async () => {
    mocks.signIn.mockRejectedValue(new Error("Network unavailable"));
    await mount(<AdminAccessState state={{ mode: "signed-out" }} />);
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Could not start GitHub sign-in");
    expect(container.querySelector("button")?.disabled).toBe(false);
  });

  it.each(["authorized", "forbidden"])("reports a returned sign-out failure for %s access", async (mode) => {
    mocks.signOut.mockResolvedValue({ error: { message: "Sign-out failed" }, data: null });
    await mount(mode === "authorized"
      ? <AdminShell activeTab="profile" description="Profile"><p>Editor</p></AdminShell>
      : <AdminAccessState state={{ mode: "forbidden" }} />);
    await act(async () => container.querySelector("button")!.click());
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Could not sign out");
    expect(container.querySelector("button")?.disabled).toBe(false);
  });
});
