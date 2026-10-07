export const linkedInContactUrl = "https://www.linkedin.com/messaging/compose/?recipient=pablopupo";

export function externalLinkProps(href: string) {
  return /^https?:\/\//i.test(href)
    ? { target: "_blank", rel: "noopener noreferrer" } as const
    : {};
}
