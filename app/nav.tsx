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
          aria-current={pathname.startsWith(href) ? "page" : undefined}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
