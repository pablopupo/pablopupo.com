export function titleToSlug(title: string) {
  return title.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 110).replace(/-$/, "");
}

export function availableDraftSlug(title: string, existingSlugs: string[]) {
  const base = titleToSlug(title);
  if (!base) return "";
  const existing = new Set(existingSlugs);
  let slug = base;
  let suffix = 2;
  while (existing.has(slug)) slug = `${base}-${suffix++}`;
  return slug;
}
