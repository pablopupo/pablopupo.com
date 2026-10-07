"use client";

import { createContext, useContext, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { afterViewTransition } from "@/lib/after-view-transition";

type Playing = { id: string; title: string; origin: HTMLElement; focus?: boolean };
type Playback = { active: Playing | null; play: (video: Playing) => void; stop: () => void };
const PlaybackContext = createContext<Playback | null>(null);

export function usePlayback() { return useContext(PlaybackContext); }

export function PlaybackProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Playing | null>(null);
  const value = useMemo(() => ({ active, play: setActive, stop: () => setActive(null) }), [active]);
  return <PlaybackContext.Provider value={value}>{children}</PlaybackContext.Provider>;
}

// This player stays in the root layout. Changing routes only moves its frame,
// never reparents or recreates the iframe and its live browsing context.
export function PersistentPlayer() {
  const playback = usePlayback();
  const active = playback?.active;
  const stop = playback?.stop;
  const pathname = usePathname();
  const frame = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!active || !frame.current) return;
    const layer = frame.current;
    let observed: HTMLElement | null = null;
    let cancelStop: (() => void) | undefined;
    const observer = new ResizeObserver(() => position());
    const position = () => {
      const slots = Array.from(document.querySelectorAll<HTMLElement>("[data-youtube-slot]"));
      const slot = slots.find((node) => node === active.origin && node.isConnected)
        ?? slots.find((node) => node.dataset.youtubeSlot === active.id);
      if (!slot) {
        // Hide it in the destination immediately, but keep React cleanup out of
        // the page animation. A synchronous state update here cancels that glide.
        layer.style.visibility = "hidden";
        cancelStop ??= afterViewTransition(() => stop?.());
        return;
      }
      cancelStop?.();
      cancelStop = undefined;
      layer.style.visibility = "visible";
      const rect = slot.getBoundingClientRect();
      if (observed !== slot) {
        observed?.removeAttribute("data-player-active");
        slot.setAttribute("data-player-active", "");
      }
      // Match the slot's inner area, excluding its border, to avoid a one-pixel jump.
      // Document coordinates also follow Next's scroll restoration during the
      // transition capture, without a stale fixed-position frame after scrolling.
      layer.style.transform = `translate(${rect.left + window.scrollX + slot.clientLeft}px, ${rect.top + window.scrollY + slot.clientTop}px)`;
      layer.style.width = `${rect.width - slot.clientLeft * 2}px`;
      layer.style.height = `${rect.height - slot.clientTop * 2}px`;
      layer.style.viewTransitionName = slot.dataset.videoTransition || "playing-recording";
      if (slot !== observed) {
        if (observed) observer.unobserve(observed);
        observer.observe(slot);
        observed = slot;
      }
    };
    position();
    const main = document.querySelector("main");
    if (main) observer.observe(main);
    // Covers disclosure expansion and graph selection without polling while idle.
    const mutations = new MutationObserver(position);
    if (main) mutations.observe(main, { childList: true, subtree: true });
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      cancelStop?.();
      observed?.removeAttribute("data-player-active");
      observer.disconnect();
      mutations.disconnect();
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [active, pathname, stop]);

  if (!active) return null;
  return <div ref={frame} className="persistent-player" style={{
    "--page-video-name": `player-page-${pathname?.replace(/[^a-z0-9]/gi, "-") || "home"}`,
  } as CSSProperties}>
    <YoutubeIframe key={active.id} id={active.id} title={active.title} focusOnMount={active.focus} />
  </div>;
}

export function YoutubeIframe({ id, title, focusOnMount = false }: { id: string; title: string; focusOnMount?: boolean }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  useLayoutEffect(() => {
    if (focusOnMount) iframe.current?.focus({ preventScroll: true });
  }, [focusOnMount]);
  return <iframe ref={iframe}
    src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1`}
    title={title}
    referrerPolicy="strict-origin-when-cross-origin"
    sandbox="allow-scripts allow-same-origin allow-presentation"
    allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
    allowFullScreen
  />;
}
