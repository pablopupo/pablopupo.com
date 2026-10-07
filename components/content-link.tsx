"use client";

import type { AnchorHTMLAttributes } from "react";
import { usePathname } from "next/navigation";
import PageLink from "./page-link";

// Markdown links use the same navigation as the menu. File links, external
// destinations, and Studio previews retain normal browser behavior.
export default function ContentLink(props: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  const pathname = usePathname();
  const path = props.href.split(/[?#]/)[0];
  const internalPage = props.href.startsWith("/") && !props.href.startsWith("//")
    && !/\.[a-z0-9]+$/i.test(path) && path !== "/resume" && !path.startsWith("/api/")
    && path !== "/admin" && !path.startsWith("/admin/");
  const inStudio = pathname === "/admin" || pathname?.startsWith("/admin/");
  if (!internalPage || inStudio || (props.download != null && props.download !== false) || (props.target && props.target !== "_self")) {
    return <a {...props} />;
  }
  return <PageLink {...props} />;
}
