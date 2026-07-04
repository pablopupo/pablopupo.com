const WIKILINK = /\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]/g;

export function renderWikilinks(markdown: string): string {
  return markdown.replace(WIKILINK, (_, target: string, label?: string) => {
    const slug = target.trim().toLowerCase().replace(/\s+/g, "-");
    const text = (label || target).trim();
    return `[${text}](/writing/${slug})`;
  });
}
