// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NavigationHistoryProvider, safeNavigationOrigin, useNavigationHistory } from "./navigation-history";
import BackLink from "./back-link";

let pathname = "/";
const back = vi.fn();
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ back }) }));
vi.mock("@/lib/recording-return", () => ({ finishRecordingReturn: () => undefined, returnToRecordingList: async (_origin: unknown, navigate: () => void) => navigate() }));
vi.mock("next/link", () => ({ default: ({ href, children, onClick, className }: { href: string; children: React.ReactNode; onClick: React.MouseEventHandler<HTMLAnchorElement>; className: string }) => <a href={href} className={className} onClick={onClick}>{children}</a> }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let navigation: ReturnType<typeof useNavigationHistory>;
function CurrentPage() {
  navigation = useNavigationHistory();
  return <BackLink href="/music" label="music" rememberOrigin />;
}
function render(path: string) {
  pathname = path;
  act(() => root.render(<NavigationHistoryProvider><CurrentPage /></NavigationHistoryProvider>));
}
function navigate(path: string) {
  navigation.remember(path);
  window.history.pushState({ __NA: true }, "", path);
  render(path);
}

beforeEach(() => {
  window.history.replaceState({ __NA: true }, "", "/");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  back.mockClear();
});
afterEach(() => { act(() => root.unmount()); host.remove(); });

describe("recording return navigation", () => {
  it.each([["/", "home"], ["/music", "music"], ["/search?q=piano", "search"]])("remembers %s and uses browser Back", (source, label) => {
    window.history.replaceState({ __NA: true }, "", source);
    render(source.split("?")[0]);
    navigate("/music/schumann");
    const link = host.querySelector("a")!;
    expect(link.getAttribute("href")).toBe(source);
    expect(link.textContent).toBe(`← Back to ${label}`);
    expect(window.history.state).toMatchObject({ __NA: true, pabloOrigin: { href: source, label } });
    act(() => link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(back).toHaveBeenCalledOnce();
  });

  it("preserves each entry's source while going back through multiple recordings", () => {
    render("/");
    navigate("/music/schumann");
    const schumannState = window.history.state;
    navigate("/music/beethoven");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/music/schumann");
    window.history.replaceState(schumannState, "", "/music/schumann");
    window.dispatchEvent(new PopStateEvent("popstate", { state: schumannState }));
    render("/music/schumann");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/");
  });

  it("uses a recording's saved source after a reload", () => {
    window.history.replaceState({ __NA: true, pabloOrigin: { href: "/", label: "home" } }, "", "/music/schumann");
    render("/music/schumann");
    expect(host.querySelector("a")?.textContent).toBe("← Back to home");
  });

  it("falls back to Music for a direct visit without an internal source", () => {
    render("/music/schumann");
    expect(host.querySelector("a")?.getAttribute("href")).toBe("/music");
    expect(navigation.origin).toBeNull();
  });

  it("leaves modified clicks available to open the source in a new tab", () => {
    render("/");
    navigate("/music/schumann");
    act(() => host.querySelector("a")!.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true })));
    expect(back).not.toHaveBeenCalled();
  });

  it("rejects external or malformed history destinations", () => {
    for (const href of ["https://example.com", "//example.com", "/\\example.com", "javascript:alert(1)"]) expect(safeNavigationOrigin({ href })).toBeNull();
  });
});
