"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { navigationMotion } from "@/lib/navigation-motion";
import { useNavigationHistory } from "./navigation-history";

export default function PageLink(props: ComponentProps<typeof Link>) {
  const pathname = usePathname();
  const history = useNavigationHistory();
  const href = typeof props.href === "string" ? props.href : props.href.pathname ?? "";
  return <Link {...props} transitionTypes={props.transitionTypes ?? navigationMotion(pathname, href)} onNavigate={(event) => {
    props.onNavigate?.(event);
    history.remember(href);
  }} />;
}
