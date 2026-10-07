const sections = ["/", "/work", "/music", "/accordo", "/writing", "/about"];
const homeIdentities = new Map([
  ["/work", "home-engineering"],
  ["/music", "home-music"],
  ["/accordo", "home-accordo"],
]);

export function navigationMotion(from: string | null, href: string) {
  if (!from || !href.startsWith("/") || href.startsWith("//")) return undefined;
  const to = href.split(/[?#]/)[0];
  if (from === to || from.startsWith("/admin") || to.startsWith("/admin")) return undefined;
  const identity = homeIdentities.get(to);
  if (from === "/" && identity) return ["from-home", identity];
  if (to === "/") return ["to-home", "section-back"];
  // A recording or project still belongs to its section when leaving through
  // the navbar. Returning to its own index keeps the shared-title transition.
  const origin = sections.findIndex((section) =>
    from === section || (section !== "/" && from.startsWith(`${section}/`))
  );
  const destination = sections.indexOf(to);
  if (origin >= 0 && destination === origin) return ["detail-back"];
  if (destination >= 0) {
    return [destination > origin ? "section-forward" : "section-back"];
  }
  return undefined;
}
