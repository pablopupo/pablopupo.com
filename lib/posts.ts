import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { performanceMetadataSchema } from "./db/validation";

const postsDir = path.join(process.cwd(), "content", "posts");

export type Post = {
  slug: string;
  title: string;
  date: string;
  description?: string;
  tags: string[];
  content: string;
  readMinutes: number;
  performance?: {
    workTitle: string;
    composer: string;
    youtubeUrl: string;
    venue: string | null;
    performedAt: string | null;
    notesMarkdown: string | null;
  };
};

export function readPostPerformance(data: Record<string, unknown>): Post["performance"] {
  if (data.kind !== "performance") return undefined;
  const details = performanceMetadataSchema.parse({
    workTitle: data.workTitle,
    composer: data.composer,
    youtubeUrl: data.youtubeUrl,
    venue: data.venue,
    performedAt: data.performedAt,
    notesMarkdown: data.notesMarkdown,
  });
  return {
    workTitle: details.workTitle,
    composer: details.composer,
    youtubeUrl: details.youtubeUrl,
    venue: details.venue ?? null,
    performedAt: details.performedAt?.toISOString() ?? null,
    notesMarkdown: details.notesMarkdown ?? null,
  };
}

export function readingTime(content: string): number {
  const words = content.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 230));
}

function readPost(file: string): Post & { draft: boolean } {
  const slug = file.replace(/\.mdx$/, "");
  const raw = fs.readFileSync(path.join(postsDir, file), "utf8");
  const { data, content } = matter(raw);
  return {
    slug,
    title: data.title,
    date: data.date,
    description: data.description,
    tags: Array.isArray(data.tags) ? data.tags : [],
    draft: data.draft === true,
    content,
    readMinutes: readingTime(content),
    performance: readPostPerformance(data),
  };
}

export function getPosts(): Post[] {
  if (!fs.existsSync(postsDir)) return [];
  return fs
    .readdirSync(postsDir)
    .filter((file) => file.endsWith(".mdx"))
    .map(readPost)
    .filter((post) => !post.draft)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function getPost(slug: string): Post | undefined {
  return getPosts().find((post) => post.slug === slug);
}

export function formatDate(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
