"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import ViewTransition from "@/components/view-transition";
import { navigationMotion } from "@/lib/navigation-motion";

export default function RouteTransition({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const committedPathname = useRef(pathname);

  useLayoutEffect(() => {
    // Rapid navigation can merge or omit the Link's transition types. Resolve
    // the page slide from the routes actually committed, before snapshots paint.
    const motion = navigationMotion(committedPathname.current, pathname);
    document.documentElement.dataset.pageMotion = motion?.includes("from-home")
      ? "home"
      : motion?.includes("section-back")
        ? "back"
        : motion?.includes("section-forward")
          ? "forward"
          : motion?.includes("detail-back") ? "detail-back" : "detail-forward";
    committedPathname.current = pathname;
  }, [pathname]);

  useEffect(() => {
    const root = document.documentElement;
    const keyboard = () => { root.dataset.navigationInput = "keyboard"; };
    const pointer = () => { delete root.dataset.navigationInput; };
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("pointerdown", pointer, true);
    return () => {
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("pointerdown", pointer, true);
      delete root.dataset.navigationInput;
      delete root.dataset.pageMotion;
    };
  }, []);

  return (
    <ViewTransition
      key={pathname}
      enter="page-motion"
      exit="page-motion"
      default="none"
    >
      <div className="route-transition">{children}</div>
    </ViewTransition>
  );
}
