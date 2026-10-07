"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AdminShell } from "./admin-shell";
import { changedPageCopy, PAGE_COPY_HEADINGS, resolvePageCopy, type PageCopy, type PageCopyKey, type PageCopyPatch } from "@/lib/page-copy";

type PageField = { key: PageCopyKey; label: string; rows?: number };
const pages: { name: string; href: string; note?: string; fields: PageField[] }[] = [
  { name: "Home", href: "/", note: "Your name, biography, portrait, and contact links are in Profile.", fields: [
    { key: "homeEngineeringIntro", label: "AI & Software introduction", rows: 4 },
    { key: "homeMusicIntro", label: "Music introduction", rows: 4 },
    { key: "homeAccordoEyebrow", label: "Label above Accordo" },
    { key: "homeAccordoIntro", label: "Accordo introduction", rows: 4 },
  ] },
  { name: "Engineering", href: "/work", note: "Edit individual projects in Projects.", fields: [
    { key: "engineeringIntro", label: "Engineering introduction", rows: 4 },
  ] },
  { name: "Music", href: "/music", note: "Add recordings, interpretation notes, and series in Writing.", fields: [
    { key: "musicIntro", label: "Music page introduction", rows: 4 },
  ] },
  { name: "Writing", href: "/writing", note: "Articles and their summaries are in Writing.", fields: [
    { key: "writingIntro", label: "Writing introduction", rows: 4 },
  ] },
  { name: "Accordo", href: "/accordo", fields: [
    { key: "accordoEyebrow", label: "Label above the title" },
    { key: "accordoTitle", label: "Main heading", rows: 2 },
    { key: "accordoIntro", label: "Accordo page introduction", rows: 4 },
    { key: "accordoStoryTitle", label: "Story heading" },
    { key: "accordoStory", label: "The story", rows: 12 },
    { key: "accordoAsideEyebrow", label: "Sidebar label" },
    { key: "accordoAsideTitle", label: "Sidebar heading", rows: 2 },
    { key: "accordoAsideIntro", label: "Sidebar text", rows: 3 },
    { key: "accordoNotesIntro", label: "Introduction to the Accordo posts", rows: 2 },
  ] },
  { name: "About", href: "/about", note: "Your full biography, graduation date, and contact details are in Profile.", fields: [
    { key: "aboutSchool", label: "University or school" },
    { key: "aboutStudy", label: "Field of study" },
  ] },
];

type SavedPages = { copy: PageCopy; version: number };
type SaveResult = { status: "saved"; saved: SavedPages } | { status: "error" | "conflict"; message: string };

function readSaved(settings: { pageCopy?: PageCopyPatch; headline?: string; version: number }): SavedPages {
  return { copy: resolvePageCopy(settings.pageCopy, settings.headline), version: settings.version };
}

export async function savePageCopy(saved: SavedPages, edited: PageCopy, fetcher: typeof fetch = fetch): Promise<SaveResult> {
  try {
    const response = await fetcher("/api/admin/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: saved.version, settings: { pageCopy: changedPageCopy(saved.copy, edited) } }),
    });
    const payload = await response.json().catch(() => null);
    if (response.status === 409) return { status: "conflict", message: "The site was edited in another tab. Your changes are still here. Copy any text you want to keep before reloading the saved version." };
    if (!response.ok || !payload?.settings) return { status: "error", message: payload?.error ?? "Could not save. Your changes are still here." };
    return { status: "saved", saved: readSaved(payload.settings) };
  } catch {
    return { status: "error", message: "Could not connect. Your changes are still here. Try saving again." };
  }
}

export default function PagesEditor() {
  const [selected, setSelected] = useState(0);
  const [saved, setSaved] = useState<SavedPages | null>(null);
  const [copy, setCopy] = useState<PageCopy>(resolvePageCopy);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "conflict" | "error">("loading");
  const [message, setMessage] = useState("");
  const dirty = saved !== null && Object.keys(changedPageCopy(saved.copy, copy)).length > 0;
  const busy = status === "loading" || status === "saving" || !saved;
  const page = pages[selected];

  async function load() {
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings", { cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.settings) throw new Error("Could not load your pages. Check that you are signed in, then try again.");
      const next = readSaved(payload.settings);
      setSaved(next);
      setCopy(next.copy);
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load your pages.");
      setStatus("error");
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    function warn(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!saved || !dirty || busy || status === "conflict") return;
    const emptyHeading = PAGE_COPY_HEADINGS.find((key) => !copy[key].trim());
    if (emptyHeading) {
      const pageIndex = pages.findIndex((item) => item.fields.some(({ key }) => key === emptyHeading));
      setSelected(pageIndex);
      setMessage("Please fill in the empty heading before saving.");
      return;
    }
    setStatus("saving");
    setMessage("");
    const result = await savePageCopy(saved, copy);
    if (result.status === "saved") {
      setSaved(result.saved);
      setCopy(result.saved.copy);
      setStatus("ready");
      setMessage("Saved. Your changes are now on the site.");
    } else {
      setStatus(result.status);
      setMessage(result.message);
    }
  }

  return <AdminShell activeTab="pages" description="Edit the text on your pages" beforeSignOut={() => !dirty || window.confirm("Discard unsaved page changes?")}>
    <form className="pages-editor" onSubmit={(event) => void submit(event)}>
      <div className="pages-toolbar">
        <div><h2>Pages</h2><p>Choose a page and edit its text. Saving updates the site.</p></div>
        <div className="pages-save"><span role="status" className="admin-meta">{status === "loading" ? "Loading pages" : !saved ? "Pages unavailable" : dirty ? "Unsaved changes" : "All changes saved"}</span><button type="submit" disabled={busy || !dirty || status === "conflict"}>{status === "saving" ? "Saving…" : "Save changes"}</button></div>
      </div>
      {message && <p className="admin-message" role="status">{message}</p>}
      {status === "conflict" && <button className="pages-reload" type="button" onClick={() => { if (window.confirm("Discard these unsaved changes and load the saved text?")) void load(); }}>Reload saved text</button>}
      {status === "error" && !saved && <button type="button" onClick={() => void load()}>Try again</button>}
      <div className="pages-body">
        <nav className="pages-picker" aria-label="Choose a page">
          {pages.map((item, index) => <button type="button" key={item.name} aria-current={selected === index ? "page" : undefined} onClick={() => setSelected(index)}>{item.name}{saved && item.fields.some(({ key }) => saved.copy[key] !== copy[key]) && <span aria-label="unsaved changes"> •</span>}</button>)}
        </nav>
        <section className="pages-fields" aria-labelledby="page-editor-title">
          <div className="pages-heading"><h3 id="page-editor-title">{page.name}</h3><a href={page.href} target="_blank" rel="noopener noreferrer">View page <span aria-hidden="true">↗</span></a></div>
          {page.note && <p className="pages-note">{page.note}</p>}
          <p className="pages-note">Use plain text. Blank lines start a new paragraph.</p>
          {page.fields.map(({ key, label, rows }) => <label key={key}>{label}<textarea rows={rows ?? 2} maxLength={10_000} required={PAGE_COPY_HEADINGS.includes(key)} value={copy[key]} disabled={busy} onChange={(event) => {
            setCopy((current) => ({ ...current, [key]: event.target.value }));
            if (status !== "conflict") { setStatus("ready"); setMessage(""); }
          }} /></label>)}
          {(page.name === "About" || page.name === "Home") && <a className="pages-profile-link" href="/admin/profile">Edit profile and biography →</a>}
        </section>
        <aside className="pages-preview" aria-label="Text preview">
          <p className="admin-meta">Text preview · {page.name}</p>
          {page.fields.map(({ key, label }) => copy[key].trim() && <div key={key}><span className="pages-preview-label">{label}</span>{PAGE_COPY_HEADINGS.includes(key) ? <h3>{copy[key]}</h3> : copy[key].split(/\n\s*\n/).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>)}
        </aside>
      </div>
    </form>
    <style>{`
      .pages-editor { margin-top: 2rem; }
      .pages-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; position: sticky; top: 0; z-index: 5; background: var(--bg); padding: 1rem 0; border-bottom: 1px solid var(--hairline); }
      .pages-toolbar h2 { margin: 0; font-size: 1.6rem; }
      .pages-toolbar p, .pages-note { color: var(--muted); font: .9rem/1.6 var(--sans); margin: .3rem 0; }
      .pages-save { display: flex; align-items: center; gap: 1rem; flex-shrink: 0; }
      .pages-save button, .pages-save .admin-meta { white-space: nowrap; }
      .pages-body { display: grid; grid-template-columns: 8rem minmax(0, 1fr) minmax(0, .85fr); gap: 2rem; margin-top: 1.5rem; align-items: start; }
      .pages-picker { display: grid; gap: .25rem; }
      .pages-editor .pages-picker button { text-align: left; background: none; border: none; border-radius: 0; padding: .7rem; color: var(--muted); }
      .pages-editor .pages-picker button[aria-current] { background: var(--code-bg); color: var(--ink); box-shadow: inset 2px 0 var(--ink); }
      .pages-heading { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; }
      .pages-heading h3 { margin: 0; font-size: 1.4rem; }
      .pages-heading a, .pages-profile-link { font: .8rem var(--sans); }
      .pages-fields { display: grid; gap: 1rem; min-width: 0; }
      .pages-fields label { display: grid; gap: .5rem; font: .85rem var(--sans); }
      .pages-fields textarea { width: 100%; box-sizing: border-box; padding: .8rem; resize: vertical; border: 1px solid var(--hairline); border-radius: 3px; background: var(--bg); color: var(--ink); font: .95rem/1.6 var(--sans); }
      .pages-fields textarea:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
      .pages-preview { border-left: 1px solid var(--hairline); padding-left: 1.5rem; overflow-wrap: anywhere; }
      .pages-preview > div { margin: 1.5rem 0; }
      .pages-preview-label { display: block; color: var(--muted); font: .7rem/1.5 var(--mono); margin-bottom: .5rem; }
      .pages-preview p { white-space: pre-line; font-size: 1rem; }
      .pages-preview h3 { white-space: pre-line; font-size: 1.5rem; }
      .pages-reload { margin-top: .75rem; }
      @media (max-width: 900px) { .pages-body { grid-template-columns: 7rem minmax(0, 1fr); } .pages-preview { grid-column: 2; border-left: 0; border-top: 1px solid var(--hairline); padding: 1rem 0 0; } }
      @media (max-width: 600px) { .pages-toolbar { align-items: start; } .pages-save { flex-direction: column-reverse; align-items: end; gap: .5rem; } .pages-body { grid-template-columns: minmax(0, 1fr); gap: 1.25rem; } .pages-picker { display: flex; overflow-x: auto; } .pages-preview { grid-column: 1; } }
    `}</style>
  </AdminShell>;
}
