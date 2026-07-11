"use client";

import { useEffect, useState } from "react";
import { marked } from "marked";

type PostSummary = {
  slug: string;
  title: string;
  date: string;
  draft: boolean;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function Editor() {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today());
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [draft, setDraft] = useState(true);
  const [body, setBody] = useState("");
  const [status, setStatus] = useState("");
  const [commitUrl, setCommitUrl] = useState("");

  async function loadPosts() {
    const res = await fetch("/api/admin/posts");
    if (res.ok) {
      const data = (await res.json()) as { posts: PostSummary[] };
      setPosts(data.posts);
      setAuthed(true);
    } else if (res.status !== 401) {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setStatus(data?.error ?? `error ${res.status}`);
      setAuthed(true);
    }
    setChecking(false);
  }

  useEffect(() => {
    loadPosts();
  }, []);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setStatus("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.status === 204) {
      setPassword("");
      await loadPosts();
    } else {
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setStatus(data?.error ?? "login failed");
    }
  }

  async function loadPost(s: string) {
    setStatus("");
    setCommitUrl("");
    const res = await fetch(`/api/admin/posts?slug=${s}`);
    if (!res.ok) {
      setStatus(`could not load ${s}`);
      return;
    }
    const data = (await res.json()) as {
      frontmatter: {
        title?: string;
        date?: string;
        description?: string;
        tags?: string[];
        draft?: boolean;
      };
      body: string;
    };
    setSlug(s);
    setSlugTouched(true);
    setTitle(data.frontmatter.title ?? "");
    setDate(data.frontmatter.date ?? today());
    setDescription(data.frontmatter.description ?? "");
    setTags(
      Array.isArray(data.frontmatter.tags) ? data.frontmatter.tags.join(", ") : ""
    );
    setDraft(data.frontmatter.draft === true);
    setBody(data.body);
  }

  function newPost() {
    setSlug("");
    setSlugTouched(false);
    setTitle("");
    setDate(today());
    setDescription("");
    setTags("");
    setDraft(true);
    setBody("");
    setStatus("");
    setCommitUrl("");
  }

  async function publish() {
    setStatus("publishing");
    setCommitUrl("");
    const res = await fetch("/api/admin/publish", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug,
        title,
        date,
        description,
        tags: tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        draft,
        body,
      }),
    });
    const data = (await res.json().catch(() => null)) as {
      commitUrl?: string;
      error?: string;
    } | null;
    if (res.ok && data?.commitUrl) {
      setStatus(draft ? "committed as draft" : "published");
      setCommitUrl(data.commitUrl);
      await loadPosts();
    } else {
      setStatus(data?.error ?? `error ${res.status}`);
    }
  }

  function onTitleChange(v: string) {
    setTitle(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  if (checking) return <p className="admin-note">checking session</p>;

  if (!authed) {
    return (
      <form onSubmit={login} className="admin-login">
        <h1>Admin</h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoFocus
        />
        <button type="submit">log in</button>
        {status && <p className="admin-note">{status}</p>}
        <style>{`
          .admin-login input { font: inherit; padding: 0.375rem 0.5rem; border: 1px solid var(--hairline); border-radius: 4px; background: var(--bg); color: var(--ink); margin-right: 0.5rem; }
          .admin-login button { font-family: var(--mono); font-size: 0.8125rem; padding: 0.375rem 0.75rem; border: 1px solid var(--hairline); border-radius: 4px; background: var(--code-bg); color: var(--ink); cursor: pointer; }
          .admin-note { font-family: var(--mono); font-size: 0.8125rem; color: var(--muted); margin-top: 0.75rem; }
        `}</style>
      </form>
    );
  }

  return (
    <div className="admin">
      <h1>Admin</h1>

      <div className="admin-list">
        <span className="label">Posts</span>
        <ul>
          {posts.map((p) => (
            <li key={p.slug}>
              <button onClick={() => loadPost(p.slug)}>{p.title}</button>
              <span className="mono-note">
                {p.date}
                {p.draft ? " draft" : ""}
              </span>
            </li>
          ))}
        </ul>
        <button className="new" onClick={newPost}>
          new post
        </button>
      </div>

      <div className="admin-fields">
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="title"
        />
        <input
          value={slug}
          onChange={(e) => {
            setSlug(e.target.value);
            setSlugTouched(true);
          }}
          placeholder="slug"
        />
        <input
          value={date}
          onChange={(e) => setDate(e.target.value)}
          placeholder="YYYY-MM-DD"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="description (excerpt)"
        />
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="tags, comma separated (music puts it on the music page)"
        />
        <label className="mono-note">
          <input
            type="checkbox"
            checked={draft}
            onChange={(e) => setDraft(e.target.checked)}
          />{" "}
          draft
        </label>
      </div>

      <div className="admin-panes">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="markdown body"
          spellCheck={false}
        />
        <div
          className="admin-preview"
          dangerouslySetInnerHTML={{ __html: marked.parse(body) as string }}
        />
      </div>
      <p className="mono-note">
        preview is plain markdown; MDX components will not render here
      </p>

      <div className="admin-actions">
        <button onClick={publish} disabled={!slug || !title}>
          {draft ? "commit draft" : "publish"}
        </button>
        {status && <span className="mono-note">{status}</span>}
        {commitUrl && (
          <a className="mono-note" href={commitUrl}>
            view commit
          </a>
        )}
      </div>

      <style>{`
        .admin input, .admin textarea { font: inherit; padding: 0.375rem 0.5rem; border: 1px solid var(--hairline); border-radius: 4px; background: var(--bg); color: var(--ink); }
        .admin-fields { display: flex; flex-direction: column; gap: 0.5rem; margin-block: 1.25rem; }
        .admin-panes { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
        .admin-panes textarea { min-height: 24rem; font-family: var(--mono); font-size: 0.875rem; line-height: 1.6; resize: vertical; }
        .admin-preview { border: 1px solid var(--hairline); border-radius: 4px; padding: 0.75rem 1rem; overflow-y: auto; max-height: 32rem; }
        .admin button { font-family: var(--mono); font-size: 0.8125rem; padding: 0.375rem 0.75rem; border: 1px solid var(--hairline); border-radius: 4px; background: var(--code-bg); color: var(--ink); cursor: pointer; }
        .admin button:disabled { opacity: 0.4; cursor: default; }
        .admin-list ul { list-style: none; margin-block: 0.5rem; }
        .admin-list li { display: flex; gap: 0.75rem; align-items: baseline; padding-block: 0.25rem; }
        .admin-list li button { border: none; background: none; padding: 0; font: inherit; color: var(--accent); cursor: pointer; }
        .mono-note { font-family: var(--mono); font-size: 0.8125rem; color: var(--muted); }
        .admin-actions { display: flex; gap: 1rem; align-items: baseline; margin-top: 1rem; }
        @media (max-width: 700px) { .admin-panes { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
