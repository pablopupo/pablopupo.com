"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import ViewTransition from "@/components/view-transition";

export default function RouteTransition({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <ViewTransition
      key={pathname}
      enter="route-crossfade"
      exit="route-crossfade"
      default="none"
    >
      <div className="route-transition">{children}</div>
    </ViewTransition>
  );
}
