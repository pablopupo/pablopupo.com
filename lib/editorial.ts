import type { PublicEntry, PublicProject } from "./public-content";

export function projectExcerpt(project: Pick<PublicProject, "summary" | "bodyMarkdown">) {
  const text = (project.summary || project.bodyMarkdown.split(/\n\s*\n/)[0] || "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*_`]/g, "")
    .trim();
  return text.length > 280 ? `${text.slice(0, 277).trimEnd()}…` : text;
}

const technicalTopics = new Set([
  "ai", "software", "engineering", "technical", "retrieval", "evaluation",
  "rag", "llm", "vllm", "typescript", "python", "document intelligence",
  "machine learning", "open source", "open-source", "inference", "systems",
]);

export function projectDevelopment(project: Pick<PublicProject, "bodyMarkdown">) {
  return project.bodyMarkdown.match(/^## (?:Development|My contribution)\s*\n+([\s\S]*?)(?=\n\s*\n|\n## |$)/m)?.[1]?.trim();
}

export function isTechnicalEntry(entry: Pick<PublicEntry, "section" | "tags">) {
  return entry.section === "writing" && entry.tags.some((tag) => technicalTopics.has(tag.toLowerCase()));
}
