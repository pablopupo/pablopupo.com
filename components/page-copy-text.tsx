/** Plain text paragraphs, preserving intentional line breaks without raw HTML. */
export default function PageCopyText({ text, className }: { text: string; className?: string }) {
  return text.split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).map((paragraph, index) => (
    <p key={index} className={className} style={{ whiteSpace: "pre-line" }}>{paragraph}</p>
  ));
}
