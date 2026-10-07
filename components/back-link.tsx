"use client";

import Link from "@/components/page-link";
import { useRouter } from "next/navigation";
import { useNavigationHistory } from "./navigation-history";
import { returnToRecordingList } from "@/lib/recording-return";

export default function BackLink({ href, label, transitionTypes, rememberOrigin = false }: { href: string; label: string; transitionTypes?: string[]; rememberOrigin?: boolean }) {
  const { origin } = useNavigationHistory();
  const router = useRouter();
  const previous = rememberOrigin ? origin : null;
  return <Link className="editorial-back" href={previous?.href ?? href} transitionTypes={transitionTypes} onClick={(event) => {
    if (!previous || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const destination = previous.href.split(/[?#]/)[0];
    if (destination === "/" || destination === "/music") {
      void returnToRecordingList(previous, () => router.back());
    } else router.back();
  }}>
    <span aria-hidden="true">←</span> Back to {previous?.label ?? label}
  </Link>;
}
