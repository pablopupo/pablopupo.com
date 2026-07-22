"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/projects", "Projects"],
  ["/contributions", "Contributions"],
  ["/writing", "Writing"],
  ["/music", "Music"],
  ["/about", "About"],
] as const;

export default function Nav() {
  const pathname = usePathname();
  const NavigationLink =
    pathname === "/admin" || pathname.startsWith("/admin/") ? "a" : Link;

  return (
    <nav>
      {pathname !== "/" && (
        <NavigationLink href="/" className="wordmark">
          Pablo Pupo
        </NavigationLink>
      )}
      {links.map(([href, label]) => (
        <NavigationLink
          key={href}
          href={href}
          aria-current={pathname.startsWith(href) ? "page" : undefined}
        >
          {label}
        </NavigationLink>
      ))}
    </nav>
  );
}
