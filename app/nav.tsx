"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import HeaderSearch from "./header-search";
import ThemeToggle from "./theme-toggle";

const links = [
  ["/", "Home"],
  ["/work", "Work"],
  ["/writing", "Writing"],
  ["/music", "Music"],
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
          const current =
            href === "/"
              ? pathname === "/"
              : pathname === href || pathname.startsWith(`${href}/`);

          return (
            <NavigationLink
              key={href}
              href={href}
              aria-current={current ? "page" : undefined}
            >
              {label}
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
