"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/work", "Work"],
  ["/writing", "Writing"],
  ["/music", "Music"],
  ["/about", "About"],
] as const;

export default function Nav() {
  const pathname = usePathname();
  const NavigationLink =
    pathname === "/admin" || pathname.startsWith("/admin/") ? "a" : Link;

  return (
    <nav aria-label="Primary navigation">
      <NavigationLink href="/" className="wordmark">
        Pablo Pupo
      </NavigationLink>
      <div className="nav-links">
        {links.map(([href, label]) => (
          <NavigationLink
            key={href}
            href={href}
            aria-current={pathname.startsWith(href) ? "page" : undefined}
          >
            {label}
          </NavigationLink>
        ))}
        <NavigationLink
          href="/search"
          className="search-link"
          aria-label="Search this site"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="7" cy="7" r="4.25" />
            <path d="m10.2 10.2 3.3 3.3" />
          </svg>
          <span>Search</span>
        </NavigationLink>
      </div>
    </nav>
  );
}
