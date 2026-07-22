"use client";

import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";

type AdminMode = "unconfigured" | "signed-out" | "forbidden" | "authorized";

type ConfigurationStatus = {
  configured: boolean;
  missing: string[];
  invalid: string[];
};

type PerformanceFields = {
  workTitle: string;
  composer: string;
  venue: string;
  performedAt: string;
  youtubeUrl: string;
  notesMarkdown: string;
};

type EditorEntry = {
  id: string | null;
  slug: string;
  kind: "note" | "essay" | "performance";
  status: "draft" | "scheduled" | "published" | "archived";
  title: string;
  summary: string;
  bodyMarkdown: string;
  publishedAt: string | null;
  updatedAt: string | null;
  version: number;
  performance: PerformanceFields;
};

type EntrySummary = Pick<
  EditorEntry,
  "id" | "slug" | "kind" | "status" | "title" | "publishedAt" | "updatedAt" | "version"
>;

type EditorProps = {
  mode: AdminMode;
  configurationStatus?: ConfigurationStatus;
};

const blankPerformance: PerformanceFields = {
  workTitle: "",
  composer: "",
  venue: "",
  performedAt: "",
  youtubeUrl: "",
  notesMarkdown: "",
};

function blankEntry(): EditorEntry {
  return {
    id: null,
    slug: "",
    kind: "note",
    status: "draft",
    title: "",
    summary: "",
    bodyMarkdown: "",
    publishedAt: null,
    updatedAt: null,
    version: 0,
    performance: { ...blankPerformance },
  };
}

export function formatDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const part = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(
    date.getDate()
  )}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

export function parseDateTimeLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function shouldDiscardUnsavedChanges(
  dirty: boolean,
  confirmDiscard: () => boolean = () =>
    window.confirm("Discard unsaved changes?")
) {
  return !dirty || confirmDiscard();
}

export function unsavedEntryActionMessage(dirty: boolean) {
  return dirty ? "Save changes before using entry actions" : undefined;
}

export async function runBusyEditorOperation<T>(
  operation: () => Promise<T>,
  setBusy: (busy: boolean) => void,
  onError: (message: string) => void
) {
  setBusy(true);
  try {
    return await operation();
  } catch {
    onError("Network request failed");
    return undefined;
  } finally {
    setBusy(false);
  }
}

function normalizeEntry(value: Record<string, unknown>): EditorEntry {
  const performance = (value.performance ?? {}) as Partial<PerformanceFields>;
  return {
    id: typeof value.id === "string" ? value.id : null,
    slug: typeof value.slug === "string" ? value.slug : "",
    kind:
      value.kind === "essay" || value.kind === "performance" ? value.kind : "note",
    status:
      value.status === "scheduled" || value.status === "published" || value.status === "archived"
        ? value.status
        : "draft",
    title: typeof value.title === "string" ? value.title : "",
    summary: typeof value.summary === "string" ? value.summary : "",
    bodyMarkdown: typeof value.bodyMarkdown === "string" ? value.bodyMarkdown : "",
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : null,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
    version: typeof value.version === "number" ? value.version : 0,
    performance: {
      workTitle: performance.workTitle ?? "",
      composer: performance.composer ?? "",
      venue: performance.venue ?? "",
      performedAt: formatDateTimeLocal(performance.performedAt),
      youtubeUrl: performance.youtubeUrl ?? "",
      notesMarkdown: performance.notesMarkdown ?? "",
    },
  };
}

function mutation(entry: EditorEntry) {
  return {
    slug: entry.slug,
    kind: entry.kind,
    status: entry.status,
    title: entry.title,
    summary: entry.summary || null,
    bodyMarkdown: entry.bodyMarkdown,
    publishedAt: entry.publishedAt,
    performance:
      entry.kind === "performance"
        ? {
            workTitle: entry.performance.workTitle,
            composer: entry.performance.composer,
            venue: entry.performance.venue || undefined,
            performedAt: parseDateTimeLocal(entry.performance.performedAt),
            youtubeUrl: entry.performance.youtubeUrl,
            notesMarkdown: entry.performance.notesMarkdown || undefined,
          }
        : null,
  };
}

async function responsePayload(response: Response) {
  return response.json().catch(() => null) as Promise<{
    error?: string;
    entry?: Record<string, unknown>;
    entries?: Record<string, unknown>[];
  } | null>;
}

export default function Editor({ mode, configurationStatus }: EditorProps) {
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [entry, setEntry] = useState<EditorEntry>(blankEntry);
  const [scheduledAt, setScheduledAt] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  function runBusy<T>(operation: () => Promise<T>) {
    return runBusyEditorOperation(operation, setBusy, setMessage);
  }

  function changeEntry(changes: Partial<EditorEntry>) {
    setEntry((current) => ({ ...current, ...changes }));
    setDirty(true);
  }

  function changePerformance(changes: Partial<PerformanceFields>) {
    setEntry((current) => ({
      ...current,
      performance: { ...current.performance, ...changes },
    }));
    setDirty(true);
  }

  async function loadEntries() {
    try {
      const response = await fetch("/api/admin/entries", { cache: "no-store" });
      const payload = await responsePayload(response);
      if (!response.ok) {
        setMessage(payload?.error ?? `Could not load entries (${response.status})`);
        return;
      }
      setEntries(
        (payload?.entries ?? []).map((item) => normalizeEntry(item) as EntrySummary)
      );
    } catch {
      setMessage("Network request failed");
    }
  }

  useEffect(() => {
    if (mode === "authorized") void loadEntries();
  }, [mode]);

  async function signIn() {
    await runBusy(async () => {
      setMessage("");
      await authClient.signIn.social({ provider: "github", callbackURL: "/admin" });
    });
  }

  async function signOut() {
    if (!shouldDiscardUnsavedChanges(dirty)) return;
    await runBusy(async () => {
      setMessage("");
      await authClient.signOut();
      window.location.assign("/admin");
    });
  }

  async function loadEntry(id: string) {
    if (!shouldDiscardUnsavedChanges(dirty)) return;
    await runBusy(async () => {
      setMessage("");
      const response = await fetch(`/api/admin/entries/${id}`, {
        cache: "no-store",
      });
      const payload = await responsePayload(response);
      if (response.ok && payload?.entry) {
        setEntry(normalizeEntry(payload.entry));
        setScheduledAt(
          formatDateTimeLocal(payload.entry.publishedAt as string | null)
        );
        setDirty(false);
      } else {
        setMessage(payload?.error ?? "Could not load entry");
      }
    });
  }

  async function save() {
    await runBusy(async () => {
      setMessage("");
      const creating = !entry.id;
      const response = await fetch(
        creating ? "/api/admin/entries" : `/api/admin/entries/${entry.id}`,
        {
          method: creating ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            creating
              ? {
                  slug: entry.slug,
                  title: entry.title,
                  kind: entry.kind,
                  summary: entry.summary || null,
                  bodyMarkdown: entry.bodyMarkdown,
                  performance: mutation(entry).performance,
                }
              : { expectedVersion: entry.version, entry: mutation(entry) }
          ),
        }
      );
      const payload = await responsePayload(response);
      if (response.ok && payload?.entry) {
        setEntry(normalizeEntry(payload.entry));
        setDirty(false);
        setMessage(creating ? "Draft created" : "Saved");
        await loadEntries();
      } else {
        setMessage(payload?.error ?? `Save failed (${response.status})`);
      }
    });
  }

  async function runAction(action: "publish" | "schedule" | "unpublish" | "archive" | "duplicate") {
    if (!entry.id) {
      setMessage("Create the draft before using this action");
      return;
    }
    const unsavedMessage = unsavedEntryActionMessage(dirty);
    if (unsavedMessage) {
      setMessage(unsavedMessage);
      return;
    }
    if (action === "schedule" && !scheduledAt) {
      setMessage("Choose a schedule time");
      return;
    }
    const scheduleTime = parseDateTimeLocal(scheduledAt);
    if (action === "schedule" && !scheduleTime) {
      setMessage("Choose a valid schedule time");
      return;
    }
    await runBusy(async () => {
      setMessage("");
      const response = await fetch(`/api/admin/entries/${entry.id}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "duplicate" ? {} : { expectedVersion: entry.version }),
          ...(action === "schedule" ? { scheduledAt: scheduleTime } : {}),
        }),
      });
      const payload = await responsePayload(response);
      if (response.ok && payload?.entry) {
        const updated = normalizeEntry(payload.entry);
        setEntry(updated);
        setScheduledAt(formatDateTimeLocal(updated.publishedAt));
        setDirty(false);
        setMessage(action === "duplicate" ? "Draft duplicated" : "Entry updated");
        await loadEntries();
      } else {
        setMessage(payload?.error ?? `Action failed (${response.status})`);
      }
    });
  }

  async function remove() {
    if (!entry.id) return;
    if (!shouldDiscardUnsavedChanges(dirty)) return;
    const confirmation = window.prompt(`Type ${entry.slug} to delete this entry`);
    if (confirmation === null) return;
    await runBusy(async () => {
      setMessage("");
      const response = await fetch(`/api/admin/entries/${entry.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: entry.version, confirmation }),
      });
      if (response.ok) {
        setEntry(blankEntry());
        setScheduledAt("");
        setDirty(false);
        setMessage("Entry deleted");
        await loadEntries();
      } else {
        const payload = await responsePayload(response);
        setMessage(payload?.error ?? `Delete failed (${response.status})`);
      }
    });
  }

  function newEntry() {
    if (!shouldDiscardUnsavedChanges(dirty)) return;
    setEntry(blankEntry());
    setScheduledAt("");
    setDirty(false);
    setMessage("");
  }

  if (mode === "unconfigured") {
    const missing = configurationStatus?.missing ?? [];
    const invalid = configurationStatus?.invalid ?? [];
    return (
      <section className="admin-state">
        <h1>Admin</h1>
        <h2>Admin configuration is incomplete</h2>
        <p>Set the following server environment variables before using the editor.</p>
        <ul>{[...missing, ...invalid].map((key) => <li key={key}><code>{key}</code></li>)}</ul>
      </section>
    );
  }

  if (mode === "signed-out") {
    return (
      <section className="admin-state">
        <h1>Admin</h1>
        <p>Only the configured GitHub owner can manage entries.</p>
        <button type="button" onClick={signIn} disabled={busy}>Sign in with GitHub</button>
        {message && <p className="admin-message">{message}</p>}
      </section>
    );
  }

  if (mode === "forbidden") {
    return (
      <section className="admin-state">
        <h1>Admin</h1>
        <p>This GitHub account does not match the configured owner.</p>
        <button type="button" onClick={signOut} disabled={busy}>Sign out</button>
        {message && <p className="admin-message" role="status">{message}</p>}
      </section>
    );
  }

  const deleteAllowed = entry.status === "draft" || entry.status === "archived";

  return (
    <div className="admin-editor">
      <header className="admin-header">
        <div>
          <h1>Admin</h1>
          <p className="admin-meta">Raw Markdown entry administration</p>
        </div>
        <button type="button" onClick={signOut} disabled={busy}>Sign out</button>
      </header>

      <div className="admin-layout">
        <aside className="admin-list" aria-label="Entries">
          <button type="button" onClick={newEntry} disabled={busy}>
            New entry
          </button>
          <ul>
            {entries.map((item) => (
              <li key={item.id ?? item.slug}>
                <button type="button" onClick={() => item.id && loadEntry(item.id)} disabled={busy}>
                  <strong>{item.title}</strong>
                  <span>{item.kind} · {item.status}</span>
                  <span>Updated {item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "unknown"}</span>
                  <span>Published {item.publishedAt ? new Date(item.publishedAt).toLocaleString() : "not set"}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        <div className="admin-form">
          <div className="admin-grid">
            <label>Title<input value={entry.title} onChange={(event) => changeEntry({ title: event.target.value })} /></label>
            <label>Slug<input value={entry.slug} onChange={(event) => changeEntry({ slug: event.target.value })} /></label>
            <label>Kind<select value={entry.kind} onChange={(event) => changeEntry({ kind: event.target.value as EditorEntry["kind"] })}><option value="note">Note</option><option value="essay">Essay</option><option value="performance">Performance</option></select></label>
            <label>Publication state<input value={entry.status} readOnly /></label>
          </div>
          <label>Summary<textarea rows={3} value={entry.summary} onChange={(event) => changeEntry({ summary: event.target.value })} /></label>
          <label>Markdown<textarea className="admin-markdown" rows={20} spellCheck={false} value={entry.bodyMarkdown} onChange={(event) => changeEntry({ bodyMarkdown: event.target.value })} /></label>

          {entry.kind === "performance" && (
            <fieldset>
              <legend>Performance metadata</legend>
              <div className="admin-grid">
                <label>Work title<input value={entry.performance.workTitle} onChange={(event) => changePerformance({ workTitle: event.target.value })} /></label>
                <label>Composer<input value={entry.performance.composer} onChange={(event) => changePerformance({ composer: event.target.value })} /></label>
                <label>Venue<input value={entry.performance.venue} onChange={(event) => changePerformance({ venue: event.target.value })} /></label>
                <label>Performed at<input type="datetime-local" value={entry.performance.performedAt} onChange={(event) => changePerformance({ performedAt: event.target.value })} /></label>
              </div>
              <label>YouTube URL<input value={entry.performance.youtubeUrl} onChange={(event) => changePerformance({ youtubeUrl: event.target.value })} /></label>
              <label>Performance notes<textarea rows={5} value={entry.performance.notesMarkdown} onChange={(event) => changePerformance({ notesMarkdown: event.target.value })} /></label>
            </fieldset>
          )}

          <div className="admin-actions">
            <button type="button" onClick={save} disabled={busy || !entry.slug || !entry.title}>Save</button>
            <button type="button" onClick={() => runAction("publish")} disabled={busy || !entry.id}>Publish now</button>
            <label>Schedule time<input type="datetime-local" value={scheduledAt} onChange={(event) => setScheduledAt(event.target.value)} /></label>
            <button type="button" onClick={() => runAction("schedule")} disabled={busy || !entry.id || !scheduledAt}>Schedule</button>
            <button type="button" onClick={() => runAction("unpublish")} disabled={busy || !entry.id}>Unpublish</button>
            <button type="button" onClick={() => runAction("archive")} disabled={busy || !entry.id}>Archive</button>
            <button type="button" onClick={() => runAction("duplicate")} disabled={busy || !entry.id}>Duplicate</button>
            <button type="button" onClick={remove} disabled={busy || !entry.id || !deleteAllowed}>Delete</button>
          </div>
          <p className="admin-meta">Version {entry.version || "new"}{dirty ? " · Unsaved changes" : ""}{entry.updatedAt ? ` · Updated ${new Date(entry.updatedAt).toLocaleString()}` : ""}{entry.publishedAt ? ` · Publishes ${new Date(entry.publishedAt).toLocaleString()}` : ""}</p>
          {message && <p className="admin-message" role="status">{message}</p>}
        </div>
      </div>

      <style>{`
        .admin-state { max-width: 36rem; }
        .admin-state h2 { margin-top: 1.5rem; }
        .admin-state ul { margin: 1rem 0 1.5rem 1.25rem; }
        .admin-editor button, .admin-state button { font: 0.8125rem var(--mono); padding: 0.45rem 0.7rem; border: 1px solid var(--hairline); border-radius: 4px; background: var(--code-bg); color: var(--ink); cursor: pointer; }
        .admin-editor button:disabled, .admin-state button:disabled { opacity: 0.45; cursor: default; }
        .admin-header { display: flex; justify-content: space-between; align-items: start; gap: 1rem; }
        .admin-layout { display: grid; grid-template-columns: minmax(13rem, 0.7fr) minmax(0, 2fr); gap: 1.5rem; margin-top: 1.5rem; }
        .admin-list { border-right: 1px solid var(--hairline); padding-right: 1rem; }
        .admin-list ul { list-style: none; margin-top: 0.75rem; }
        .admin-list li + li { border-top: 1px solid var(--hairline); }
        .admin-list li button { width: 100%; border: 0; background: transparent; text-align: left; padding: 0.65rem 0; display: grid; gap: 0.15rem; }
        .admin-list li span, .admin-meta { color: var(--muted); font: 0.75rem var(--mono); }
        .admin-form { min-width: 0; display: grid; gap: 0.85rem; }
        .admin-form label { display: grid; gap: 0.3rem; font: 0.75rem var(--mono); color: var(--muted); }
        .admin-form input, .admin-form select, .admin-form textarea { width: 100%; font: inherit; color: var(--ink); background: var(--bg); border: 1px solid var(--hairline); border-radius: 4px; padding: 0.5rem 0.6rem; }
        .admin-form input[readonly] { background: var(--code-bg); }
        .admin-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
        .admin-markdown { font-family: var(--mono) !important; line-height: 1.55; resize: vertical; }
        .admin-form fieldset { display: grid; gap: 0.75rem; padding: 0.85rem; border: 1px solid var(--hairline); border-radius: 4px; }
        .admin-form legend { padding-inline: 0.35rem; font: 0.75rem var(--mono); color: var(--muted); }
        .admin-actions { display: flex; flex-wrap: wrap; align-items: end; gap: 0.55rem; padding-top: 0.35rem; }
        .admin-actions label { min-width: 13rem; }
        .admin-message { font: 0.8125rem var(--mono); color: var(--accent); }
        @media (max-width: 760px) { .admin-layout { grid-template-columns: 1fr; } .admin-list { border-right: 0; border-bottom: 1px solid var(--hairline); padding: 0 0 1rem; } .admin-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
