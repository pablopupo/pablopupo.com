// A layout-effect state update can cancel React's newly captured page animation.
// Defer nonvisual cleanup until the native transition (including capture) ends.
export function afterViewTransition(callback: () => void) {
  let cancelled = false;
  let frame = 0;
  const hasActiveTransition = Reflect.has(document, "activeViewTransition");

  const settle = (finished?: ViewTransition) => {
    if (cancelled) return;
    const current = document.activeViewTransition;
    if (current && current !== finished) {
      void current.finished.then(() => settle(current), () => settle(current));
      return;
    }
    if (!hasActiveTransition) {
      // Older implementations expose the active selector before their snapshot
      // animations exist, but don't expose the transition object itself.
      try {
        if (document.documentElement.matches(":active-view-transition")) {
          frame = requestAnimationFrame(() => settle());
          return;
        }
      } catch { /* The selector is optional in older browsers. */ }
      const animations = document.getAnimations?.().filter((animation) =>
        (animation.effect as KeyframeEffect | null)?.pseudoElement?.startsWith("::view-transition")
        && animation.playState !== "finished" && animation.playState !== "idle"
      ) ?? [];
      if (animations.length) {
        void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => settle());
        return;
      }
    }
    callback();
  };

  // Allow snapshot creation in browsers without the active-transition API.
  if (!hasActiveTransition && typeof document.startViewTransition === "function") {
    frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => settle()); });
  } else settle();

  return () => { cancelled = true; cancelAnimationFrame(frame); };
}
