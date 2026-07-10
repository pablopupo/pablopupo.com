"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  ["/", "Home"],
  ["/projects", "Projects"],
  ["/contributions", "Contributions"],
  ["/writing", "Writing"],
  ["/about", "About"],
] as const;

export default function Nav() {
  const pathname = usePathname();

  return (
    <nav>
      {pathname !== "/" && (
        <Link href="/" className="wordmark">
          Pablo Pupo
        </Link>
      )}
      {links.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={
            (href === "/" ? pathname === "/" : pathname.startsWith(href))
              ? "page"
              : undefined
          }
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
