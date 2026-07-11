import { requireSession } from "@/lib/admin-session";

const REPO = process.env.GITHUB_REPO ?? "pablopupo/pablopupo.com";
const API = "https://api.github.com";

type PublishBody = {
  slug: string;
  title: string;
  date: string;
  description?: string;
  tags?: string[];
  draft: boolean;
  body: string;
};

function compose(p: PublishBody): string {
  const lines = ["---", `title: ${p.title}`, `date: "${p.date}"`];
  if (p.description) lines.push(`description: ${p.description}`);
  if (p.tags && p.tags.length > 0) {
    lines.push(`tags: [${p.tags.join(", ")}]`);
  }
  if (p.draft) lines.push("draft: true");
  lines.push("---", "", p.body.trim(), "");
  return lines.join("\n");
}

export async function POST(req: Request) {
  if (!requireSession(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.GITHUB_TOKEN) {
    return Response.json({ error: "GITHUB_TOKEN not set" }, { status: 503 });
  }
  const p = (await req.json().catch(() => null)) as PublishBody | null;
  if (!p?.slug || !/^[a-z0-9-]+$/.test(p.slug) || !p.title || !p.date) {
    return Response.json(
      { error: "slug, title, and date required" },
      { status: 400 }
    );
  }
  const path = `content/posts/${p.slug}.mdx`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
  };
  const existing = await fetch(`${API}/repos/${REPO}/contents/${path}`, {
    headers,
    cache: "no-store",
  });
  const sha = existing.ok
    ? ((await existing.json()) as { sha: string }).sha
    : undefined;
  const res = await fetch(`${API}/repos/${REPO}/contents/${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: sha ? `Update post ${p.slug}` : `Publish post ${p.slug}`,
      content: Buffer.from(compose(p)).toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    return Response.json({ error: await res.text() }, { status: res.status });
  }
  const out = (await res.json()) as { commit: { html_url: string } };
  return Response.json({ commitUrl: out.commit.html_url });
}
