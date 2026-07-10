import matter from "gray-matter";
import { requireSession } from "@/lib/admin-session";

const REPO = process.env.GITHUB_REPO ?? "pablopupo/pablopupo.com";
const API = "https://api.github.com";

function gh(pathname: string) {
  return fetch(`${API}${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    },
    cache: "no-store",
  });
}

export async function GET(req: Request) {
  if (!requireSession(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.GITHUB_TOKEN) {
    return Response.json({ error: "GITHUB_TOKEN not set" }, { status: 503 });
  }
  const slug = new URL(req.url).searchParams.get("slug");
  if (slug) {
    const res = await gh(`/repos/${REPO}/contents/content/posts/${slug}.mdx`);
    if (!res.ok) {
      return Response.json({ error: await res.text() }, { status: res.status });
    }
    const file = (await res.json()) as { content: string };
    const raw = Buffer.from(file.content, "base64").toString("utf8");
    const { data, content } = matter(raw);
    return Response.json({ frontmatter: data, body: content });
  }
  const res = await gh(`/repos/${REPO}/contents/content/posts`);
  if (!res.ok) {
    return Response.json({ error: await res.text() }, { status: res.status });
  }
  const files = (await res.json()) as { name: string }[];
  const posts = [];
  for (const f of files.filter((f) => f.name.endsWith(".mdx"))) {
    const one = await gh(`/repos/${REPO}/contents/content/posts/${f.name}`);
    if (!one.ok) continue;
    const file = (await one.json()) as { content: string };
    const { data } = matter(
      Buffer.from(file.content, "base64").toString("utf8")
    );
    posts.push({
      slug: f.name.replace(/\.mdx$/, ""),
      title: data.title ?? f.name,
      date: data.date ?? "",
      draft: data.draft === true,
    });
  }
  return Response.json({ posts });
}
