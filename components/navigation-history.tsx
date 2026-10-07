"use client";

import { createContext, useContext, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { finishRecordingReturn } from "@/lib/recording-return";

type Origin = { href: string; label: string; scrollX?: number; scrollY?: number };
type PendingNavigation = { destination: string; origin: Origin };
const NavigationHistoryContext = createContext<{ origin: Origin | null; remember: (href: string) => void }>({ origin: null, remember: () => undefined });
const subscribe = () => () => undefined;

export function navigationLabel(pathname: string) {
  if (pathname === "/") return "home";
  if (pathname === "/music") return "music";
  if (pathname.startsWith("/music/")) return "the previous page";
  if (pathname.startsWith("/work")) return "engineering";
  if (pathname.startsWith("/writing")) return "writing";
  if (pathname === "/accordo") return "Accordo";
  if (pathname === "/search") return "search";
  if (pathname === "/about") return "about";
  return "the previous page";
}

export function safeNavigationOrigin(value: unknown): Origin | null {
  if (!value || typeof value !== "object") return null;
  const href = "href" in value ? value.href : null;
  if (typeof href !== "string" || !href.startsWith("/") || href.startsWith("//") || /[\\\r\n]/.test(href)) return null;
  const offset = (key: "scrollX" | "scrollY") => {
    const position = (value as Record<string, unknown>)[key];
    return typeof position === "number" && Number.isFinite(position) ? Math.max(0, position) : 0;
  };
  return { href, label: navigationLabel(href.split(/[?#]/)[0]), scrollX: offset("scrollX"), scrollY: offset("scrollY") };
}

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const pending = useRef<PendingNavigation | null>(null);
  const navigation = pending.current?.destination === pathname ? pending.current : null;
  const origin = navigation?.origin ?? (hydrated ? safeNavigationOrigin(window.history.state?.pabloOrigin) : null);

  useLayoutEffect(() => {
    if (navigation) {
      // Preserve the router's history fields, and attach the source only to this
      // entry. Browser Back restores its own source instead of creating a loop.
      window.history.replaceState({ ...window.history.state, pabloOrigin: navigation.origin }, "");
      pending.current = null;
    }
    finishRecordingReturn(pathname);
  }, [pathname, navigation]);

  useLayoutEffect(() => {
    const pop = () => { pending.current = null; };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  return <NavigationHistoryContext.Provider value={{ origin, remember: (href) => {
    const destination = new URL(href, window.location.href);
    if (destination.origin !== window.location.origin || destination.pathname === pathname) return;
    pending.current = {
      destination: destination.pathname,
      origin: { href: window.location.pathname + window.location.search + window.location.hash, label: navigationLabel(pathname), scrollX: window.scrollX, scrollY: window.scrollY },
    };
  } }}>{children}</NavigationHistoryContext.Provider>;
}

export function useNavigationHistory() { return useContext(NavigationHistoryContext); }
