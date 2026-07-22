"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "./admin-shell";

type ModerationStatus = "pending" | "approved" | "rejected" | "spam";
export type ModerationFilter = ModerationStatus | "all";

export type AdminComment = {
  id: string;
  entryId: string;
  entrySlug: string;
  entryTitle: string;
  entrySection: "writing" | "music";
  authorName: string | null;
  body: string;
  moderationStatus: ModerationStatus;
  authorReplyMarkdown: string | null;
  authorRepliedAt: string | null;
  moderatedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

async function adminPayload(response: Response) {
  return response.json().catch(() => null) as Promise<{
    comment?: Partial<AdminComment> & { id: string };
    comments?: AdminComment[];
    nextCursor?: string | null;
    error?: string;
  } | null>;
}

async function updateAdminComment(
  commentId: string,
  body: Record<string, unknown>,
  fetcher: Fetcher
) {
  const response = await fetcher(`/api/admin/comments/${commentId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await adminPayload(response);
  if (!response.ok || !payload?.comment) {
    throw new Error(payload?.error ?? "The comment could not be updated.");
  }
  return payload.comment;
}

export function moderateAdminComment(
  commentId: string,
  moderationStatus: ModerationStatus,
  fetcher: Fetcher = fetch
) {
  return updateAdminComment(
    commentId,
    { action: "moderate", moderationStatus },
    fetcher
  );
}

export function saveAdminReply(
  commentId: string,
  authorReplyMarkdown: string | null,
  fetcher: Fetcher = fetch
) {
  return updateAdminComment(
    commentId,
    { action: "reply", authorReplyMarkdown },
    fetcher
  );
}

export async function loadAdminComments(
  options: {
    status: ModerationFilter;
    cursor?: string;
    limit: number;
  },
  fetcher: Fetcher = fetch
) {
  const cursor = options.cursor
    ? `&cursor=${encodeURIComponent(options.cursor)}`
    : "";
  const response = await fetcher(
    `/api/admin/comments?status=${options.status}&limit=${options.limit}${cursor}`,
    { cache: "no-store" }
  );
  const payload = await adminPayload(response);
  if (!response.ok || !Array.isArray(payload?.comments)) {
    throw new Error(payload?.error ?? "Comments could not be loaded.");
  }
  return {
    comments: payload.comments,
    nextCursor:
      typeof payload.nextCursor === "string" ? payload.nextCursor : null,
  };
}

export function addBusyComment(current: Set<string>, commentId: string) {
  const next = new Set(current);
  next.add(commentId);
  return next;
}

export function removeBusyComment(current: Set<string>, commentId: string) {
  const next = new Set(current);
  next.delete(commentId);
  return next;
}

export function reconcileSavedReply(
  current: string,
  submitted: string,
  saved: string
) {
  return current === submitted ? saved : current;
}

export function mergeLoadedReplies(
  current: Record<string, string>,
  loaded: Record<string, string>
) {
  return { ...loaded, ...current };
}

export function isCommentFilterDisabled(
  loading: boolean,
  loadingMore: boolean,
  busyIds: Set<string>
) {
  return loading || loadingMore || busyIds.size > 0;
}

function repliesFrom(comments: AdminComment[]) {
  return Object.fromEntries(
    comments.map((comment) => [comment.id, comment.authorReplyMarkdown ?? ""])
  );
}

function displayDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function CommentsManager({
  initialComments,
  initialNextCursor,
}: {
  initialComments?: AdminComment[];
  initialNextCursor?: string | null;
}) {
  const [comments, setComments] = useState(initialComments ?? []);
  const [replies, setReplies] = useState(() => repliesFrom(initialComments ?? []));
  const [loading, setLoading] = useState(initialComments === undefined);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(initialNextCursor ?? null);
  const [status, setStatus] = useState<ModerationFilter>("pending");
  const [busyIds, setBusyIds] = useState(() => new Set<string>());
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setComments([]);
    setNextCursor(null);
    void loadAdminComments({ status, limit: 50 })
      .then((page) => {
        if (!active) return;
        setComments(page.comments);
        setReplies((current) =>
          mergeLoadedReplies(current, repliesFrom(page.comments))
        );
        setNextCursor(page.nextCursor);
        setMessage("");
      })
      .catch((error: unknown) => {
        if (active) {
          setMessage(
            error instanceof Error ? error.message : "Comments could not be loaded."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [status]);

  function mergeComment(update: Partial<AdminComment> & { id: string }) {
    setComments((current) =>
      current.flatMap((comment) => {
        if (comment.id !== update.id) return [comment];
        const merged = { ...comment, ...update };
        return status === "all" || merged.moderationStatus === status
          ? [merged]
          : [];
      })
    );
  }

  async function moderate(commentId: string, status: ModerationStatus) {
    setBusyIds((current) => addBusyComment(current, commentId));
    setMessage("");
    try {
      mergeComment(await moderateAdminComment(commentId, status));
      setMessage("Moderation updated.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The comment could not be updated."
      );
    } finally {
      setBusyIds((current) => removeBusyComment(current, commentId));
    }
  }

  async function submitReply(
    event: FormEvent<HTMLFormElement>,
    commentId: string
  ) {
    event.preventDefault();
    setBusyIds((current) => addBusyComment(current, commentId));
    setMessage("");
    const submitted = replies[commentId] ?? "";
    const reply = submitted.trim() || null;
    try {
      const updated = await saveAdminReply(commentId, reply);
      mergeComment(updated);
      const saved = updated.authorReplyMarkdown ?? reply ?? "";
      setReplies((current) => ({
        ...current,
        [commentId]: reconcileSavedReply(
          current[commentId] ?? "",
          submitted,
          saved
        ),
      }));
      setMessage(reply ? "Reply saved." : "Reply removed.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The reply could not be saved."
      );
    } finally {
      setBusyIds((current) => removeBusyComment(current, commentId));
    }
  }

  async function loadMoreComments() {
    if (!nextCursor) return;
    setLoadingMore(true);
    setMessage("");
    try {
      const page = await loadAdminComments({
        status,
        limit: 50,
        cursor: nextCursor,
      });
      setComments((current) => [...current, ...page.comments]);
      setReplies((current) =>
        mergeLoadedReplies(current, repliesFrom(page.comments))
      );
      setNextCursor(page.nextCursor);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Comments could not be loaded."
      );
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <AdminShell activeTab="comments" description="Review anonymous comments and reply">
      <div className="comments-admin-filter">
        <label htmlFor="comment-status-filter">Filter comments</label>
        <select
          id="comment-status-filter"
          value={status}
          disabled={isCommentFilterDisabled(loading, loadingMore, busyIds)}
          onChange={(event) =>
            setStatus(event.target.value as ModerationFilter)
          }
        >
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="spam">Spam</option>
          <option value="all">All</option>
        </select>
      </div>
      {message && <p className="admin-message" role="status">{message}</p>}
      {loading && <p className="comments-admin-state">Loading comments…</p>}
      {!loading && comments.length === 0 && (
        <p className="comments-admin-state">No {status} comments.</p>
      )}
      <div className="comments-admin-list" aria-busy={loading || loadingMore}>
        {comments.map((comment) => {
          const busy = busyIds.has(comment.id);
          return (
            <article className="comments-admin-item" key={comment.id}>
              <header>
                <div>
                  <span className={`comment-status status-${comment.moderationStatus}`}>
                    {comment.moderationStatus}
                  </span>
                  <strong>{comment.authorName || "Anonymous"}</strong>
                </div>
                <time dateTime={comment.createdAt}>{displayDate(comment.createdAt)}</time>
              </header>
              <a href={`/${comment.entrySection}/${comment.entrySlug}`} target="_blank" rel="noreferrer">
                {comment.entryTitle}
              </a>
              <p className="comments-admin-body">{comment.body}</p>
              <div className="comments-admin-actions" aria-label="Moderation actions">
                <button type="button" disabled={busy} onClick={() => void moderate(comment.id, "approved")}>Approve</button>
                <button type="button" disabled={busy} onClick={() => void moderate(comment.id, "rejected")}>Reject</button>
                <button type="button" disabled={busy} onClick={() => void moderate(comment.id, "spam")}>Mark spam</button>
                <button type="button" disabled={busy} onClick={() => void moderate(comment.id, "pending")}>Move to pending</button>
              </div>
              <form onSubmit={(event) => void submitReply(event, comment.id)}>
                <label htmlFor={`reply-${comment.id}`}>Owner reply (Markdown)</label>
                <textarea
                  id={`reply-${comment.id}`}
                  value={replies[comment.id] ?? ""}
                  maxLength={4000}
                  rows={4}
                  disabled={busy}
                  onChange={(event) =>
                    setReplies((current) => ({
                      ...current,
                      [comment.id]: event.target.value,
                    }))
                  }
                />
                <button type="submit" disabled={busy}>Save reply</button>
              </form>
            </article>
          );
        })}
      </div>
      {nextCursor && !loading && (
        <button
          className="comments-admin-more"
          type="button"
          disabled={loadingMore}
          onClick={() => void loadMoreComments()}
        >
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
      <style>{`
        .comments-admin-filter { display: flex; align-items: center; gap: .75rem; margin-top: 1.5rem; }
        .comments-admin-filter label { font: .75rem var(--mono); }
        .comments-admin-filter select { border: 1px solid var(--hairline); border-radius: 3px; padding: .45rem .6rem; background: var(--surface); color: var(--ink); font: .8rem var(--mono); }
        .comments-admin-state { margin-top: 2rem; color: var(--muted); }
        .comments-admin-list { display: grid; gap: 1rem; margin-top: 1.5rem; }
        .comments-admin-item { padding: 1.1rem; border: 1px solid var(--hairline); border-radius: 4px; }
        .comments-admin-item > header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
        .comments-admin-item > header div { display: flex; align-items: center; gap: .65rem; }
        .comments-admin-item time, .comment-status { color: var(--muted); font: .7rem var(--mono); }
        .comment-status { padding: .2rem .35rem; border: 1px solid var(--hairline); border-radius: 3px; text-transform: uppercase; }
        .comments-admin-item > a { display: inline-block; margin-top: .7rem; font: .75rem var(--mono); }
        .comments-admin-body { margin: .75rem 0; white-space: pre-wrap; overflow-wrap: anywhere; }
        .comments-admin-actions { display: flex; flex-wrap: wrap; gap: .5rem; }
        .comments-admin-item form { display: grid; gap: .45rem; margin-top: 1rem; }
        .comments-admin-item label { font: .75rem var(--mono); }
        .comments-admin-item textarea { width: 100%; resize: vertical; border: 1px solid var(--hairline); border-radius: 3px; padding: .65rem; background: var(--surface); color: var(--ink); font: .9rem/1.5 var(--mono); }
        .comments-admin-item form button { justify-self: start; }
        .comments-admin-more { margin-top: 1rem; }
      `}</style>
    </AdminShell>
  );
}

export default CommentsManager;
