type ReturnOrigin = { href: string; scrollX?: number; scrollY?: number };
type PendingReturn = {
  destination: string;
  source: string;
  origin: ReturnOrigin;
  restore: (element: HTMLElement, name: string) => void;
  resolve: () => void;
};
let pending: PendingReturn | null = null;
let returning = false;

// History traversal does not run React's route view transition. Capture the
// recording explicitly, then restore the list's scroll before the new snapshot.
export async function returnToRecordingList(origin: ReturnOrigin, back: () => void) {
  if (returning) return;
  returning = true;
  const active = document.activeViewTransition;
  if (active) {
    active.skipTransition();
    await active.finished.catch(() => undefined);
  }
  const root = document.documentElement;
  const restoration = window.history.scrollRestoration;
  const cleanups: Array<() => void> = [];
  const nameElement = (element: HTMLElement, name: string) => {
    const previous = element.style.viewTransitionName;
    element.style.viewTransitionName = name;
    cleanups.push(() => { element.style.viewTransitionName = previous; });
  };
  const route = document.querySelector<HTMLElement>(".route-transition");
  const title = document.querySelector<HTMLElement>(".recording-page h1");
  if (route) nameElement(route, "recording-return-old");
  if (title) nameElement(title, "recording-return-title");
  root.dataset.recordingReturn = "";
  window.history.scrollRestoration = "manual";
  let release!: () => void;
  const restored = new Promise<void>((resolve) => { release = resolve; });
  pending = {
    destination: origin.href.split(/[?#]/)[0],
    source: window.location.pathname,
    origin,
    restore: nameElement,
    resolve: release,
  };
  // Navigation failures must never leave the old snapshot covering the page.
  const timeout = window.setTimeout(release, 8000);
  const cleanup = () => {
    window.clearTimeout(timeout);
    cleanups.reverse().forEach((restore) => restore());
    delete root.dataset.recordingReturn;
    window.history.scrollRestoration = restoration;
    pending = null;
    returning = false;
  };
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const animate = typeof document.startViewTransition === "function" && !reduced && root.dataset.navigationInput !== "keyboard";
  let navigated = false;
  const navigate = () => { navigated = true; back(); return restored; };
  try {
    if (animate) {
      const transition = document.startViewTransition({ types: ["recording", "recording-return"], update: navigate });
      await transition.finished;
    } else {
      await navigate();
    }
  } catch {
    // Older browsers may only support the callback form of the API. Navigation
    // and instant scroll restoration still work when snapshots are unavailable.
    if (!navigated) await navigate();
  } finally { cleanup(); }
}

export function finishRecordingReturn(pathname: string) {
  const current = pending;
  if (!current || pathname === current.source) return;
  if (pathname !== current.destination) {
    current.resolve();
    return;
  }
  const route = document.querySelector<HTMLElement>(".route-transition");
  if (route) current.restore(route, "recording-return-new");
  const title = [...document.querySelectorAll<HTMLElement>(".recording-feature h3, .music-recording h3")]
    .find((heading) => heading.querySelector("a")?.getAttribute("href") === current.source);
  if (title) current.restore(title, "recording-return-title");
  window.scrollTo({ left: current.origin.scrollX ?? 0, top: current.origin.scrollY ?? 0, behavior: "instant" });
  // The persistent player is positioned outside the page. Align it now, before
  // the browser captures the destination, rather than on a later scroll event.
  window.dispatchEvent(new Event("scroll"));
  current.resolve();
}
