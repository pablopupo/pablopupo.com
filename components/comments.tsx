"use client";

import {
  useEffect,
  useState,
  type FormEvent,
} from "react";
import MarkdownContent from "./markdown-content";

export type PublicComment = {
  id: string;
  authorName: string | null;
  body: string;
  authorReplyMarkdown: string | null;
  authorRepliedAt: string | null;
  createdAt: string;
};

type CommentDraft = {
  authorName: string;
  body: string;
  website: string;
};

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

function commentEndpoint(entryId: string) {
  return `/api/comments?entryId=${encodeURIComponent(entryId)}`;
}

async function responsePayload(response: Response) {
  return response.json().catch(() => null) as Promise<{
    comments?: PublicComment[];
    error?: string;
    message?: string;
  } | null>;
}

export async function loadPublicComments(
  entryId: string,
  fetcher: Fetcher = fetch
) {
  const response = await fetcher(commentEndpoint(entryId), {
    cache: "no-store",
  });
  const payload = await responsePayload(response);
  if (!response.ok || !Array.isArray(payload?.comments)) {
    throw new Error(payload?.error ?? "Comments could not be loaded.");
  }
  return payload.comments;
}

export async function submitPublicComment(
  entryId: string,
  draft: CommentDraft,
  fetcher: Fetcher = fetch
) {
  const response = await fetcher(commentEndpoint(entryId), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(draft),
  });
  const payload = await responsePayload(response);
  if (!response.ok || !payload?.message) {
    throw new Error(payload?.error ?? "The comment could not be submitted.");
  }
  return { message: payload.message };
}

export function clearSubmittedValue(current: string, submitted: string) {
  return current === submitted ? "" : current;
}

function commentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

export function Comments({
  entryId,
  initialComments,
}: {
  entryId: string;
  initialComments?: PublicComment[];
}) {
  const [comments, setComments] = useState(initialComments ?? []);
  const [loading, setLoading] = useState(initialComments === undefined);
  const [loadMessage, setLoadMessage] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionMessage, setSubmissionMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(initialComments === undefined);
    void loadPublicComments(entryId)
      .then((loaded) => {
        if (!active) return;
        setComments(loaded);
        setLoadMessage("");
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadMessage(
          error instanceof Error ? error.message : "Comments could not be loaded."
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [entryId, initialComments]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmissionMessage("");
    const submitted = { authorName, body, website };
    try {
      const result = await submitPublicComment(entryId, submitted);
      setAuthorName((current) =>
        clearSubmittedValue(current, submitted.authorName)
      );
      setBody((current) => clearSubmittedValue(current, submitted.body));
      setWebsite((current) =>
        clearSubmittedValue(current, submitted.website)
      );
      setSubmissionMessage(result.message);
    } catch (error) {
      setSubmissionMessage(
        error instanceof Error ? error.message : "The comment could not be submitted."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="comments" aria-labelledby="comments-heading">
      <header className="comments-header">
        <p className="eyebrow">Discussion</p>
        <h2 id="comments-heading">Comments</h2>
      </header>

      <div className="comment-list" aria-busy={loading}>
        {loading && <p className="comment-state">Loading comments…</p>}
        {!loading && loadMessage && (
          <p className="comment-state" role="status">{loadMessage}</p>
        )}
        {!loading && !loadMessage && comments.length === 0 && (
          <p className="comment-state">No comments yet.</p>
        )}
        {comments.map((comment) => (
          <article className="comment" key={comment.id}>
            <header>
              <strong>{comment.authorName || "Anonymous"}</strong>
              <time dateTime={comment.createdAt}>{commentDate(comment.createdAt)}</time>
            </header>
            <p className="comment-body">{comment.body}</p>
            {comment.authorReplyMarkdown && (
              <aside className="comment-reply" aria-label="Reply from Pablo">
                <strong>Pablo replied</strong>
                <MarkdownContent markdown={comment.authorReplyMarkdown} />
              </aside>
            )}
          </article>
        ))}
      </div>

      <form className="comment-form" onSubmit={submit}>
        <h3>Leave a comment</h3>
        <p>No account or email is required. Comments appear after approval.</p>
        <label>
          Name <span>(optional)</span>
          <input
            name="authorName"
            value={authorName}
            maxLength={80}
            autoComplete="name"
            disabled={submitting}
            onChange={(event) => setAuthorName(event.target.value)}
          />
        </label>
        <label>
          Comment
          <textarea
            name="body"
            value={body}
            required
            maxLength={4000}
            rows={6}
            disabled={submitting}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        <label className="comment-honeypot" aria-hidden="true">
          Website
          <input
            name="website"
            value={website}
            tabIndex={-1}
            autoComplete="off"
            disabled={submitting}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>
        <div className="comment-form-footer">
          <button type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit comment"}
          </button>
          {submissionMessage && <p role="status">{submissionMessage}</p>}
        </div>
      </form>

      <style>{`
        .comments { margin-top: 5rem; padding-top: 2rem; border-top: 1px solid var(--hairline); }
        .comments-header .eyebrow { margin: 0 0 .35rem; }
        .comments-header h2 { margin: 0; }
        .comment-list { margin-top: 1.75rem; }
        .comment-state { color: var(--muted); }
        .comment { padding: 1.25rem 0; border-top: 1px solid var(--hairline); }
        .comment > header { display: flex; justify-content: space-between; gap: 1rem; font-size: .875rem; }
        .comment time { color: var(--muted); font-family: var(--mono); font-size: .75rem; }
        .comment-body { white-space: pre-wrap; overflow-wrap: anywhere; margin: .65rem 0 0; }
        .comment-reply { margin: 1rem 0 0 1rem; padding-left: 1rem; border-left: 2px solid var(--accent); }
        .comment-reply > strong { font-family: var(--mono); font-size: .75rem; }
        .comment-reply .markdown-content { margin-top: .35rem; }
        .comment-form { margin-top: 2rem; padding-top: 1.5rem; border-top: 1px solid var(--hairline); }
        .comment-form h3 { margin: 0; }
        .comment-form > p { color: var(--muted); margin: .35rem 0 1.25rem; }
        .comment-form label { display: grid; gap: .35rem; margin-top: 1rem; font-family: var(--mono); font-size: .75rem; }
        .comment-form label span { color: var(--muted); }
        .comment-form input, .comment-form textarea { width: 100%; border: 1px solid var(--hairline); border-radius: 3px; padding: .7rem .75rem; background: var(--surface); color: var(--ink); font: 1rem/1.5 var(--sans); }
        .comment-form textarea { resize: vertical; }
        .comment-honeypot { position: absolute; left: -10000px; width: 1px; height: 1px; overflow: hidden; }
        .comment-form-footer { display: flex; align-items: center; gap: 1rem; margin-top: 1rem; }
        .comment-form-footer button { border: 1px solid var(--ink); border-radius: 3px; background: var(--ink); color: var(--surface); padding: .6rem .85rem; font: .75rem var(--mono); cursor: pointer; }
        .comment-form-footer button:disabled { opacity: .55; cursor: default; }
        .comment-form-footer p { margin: 0; color: var(--muted); font-size: .875rem; }
      `}</style>
    </section>
  );
}

export default Comments;
