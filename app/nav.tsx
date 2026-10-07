"use client";

import Link from "@/components/page-link";
import { usePathname } from "next/navigation";
import HeaderSearch from "./header-search";
import ThemeToggle from "./theme-toggle";
import ViewTransition from "@/components/view-transition";

const links = [
  ["/work", "Engineering"],
  ["/music", "Music"],
  ["/accordo", "Accordo"],
  ["/writing", "Writing"],
  ["/about", "About"],
] as const;

export default function Nav() {
  const pathname = usePathname();
  const adminPath = pathname === "/admin" || pathname.startsWith("/admin/");
  const NavigationLink = adminPath ? "a" : Link;

  return (
    <nav aria-label="Primary navigation">
      <NavigationLink href="/" className="wordmark">
        Pablo Pupo
      </NavigationLink>
      <div className="nav-links">
        {links.map(([href, label]) => {
          const current = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <NavigationLink
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
            >
              {label}
              {current && <ViewTransition name="navigation-indicator" share="navigation-indicator" default="none">
                <span className="nav-current-indicator" aria-hidden="true" />
              </ViewTransition>}
            </NavigationLink>
          );
        })}
      </div>
      <div className="nav-actions">
        <HeaderSearch pathname={pathname} plainLinks={adminPath} />
        <ThemeToggle />
      </div>
    </nav>
  );
}
