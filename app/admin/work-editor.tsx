"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { preparePreviewWindow } from "@/lib/admin/preview-window";
import { AdminShell } from "./admin-shell";
import MarkdownEditor, { type MarkdownSnapshot } from "./markdown-editor";

type ProjectStatus = "draft" | "scheduled" | "published" | "archived";
type ProjectKind = "project" | "experience";
type ProjectLinkKind =
  | "repository"
  | "live"
  | "demo"
  | "writeup"
  | "other";

type EditorProjectLink = {
  kind: ProjectLinkKind;
  label: string;
  url: string;
  sortOrder: number;
};

export type EditorProject = {
  id: string | null;
  slug: string;
  kind: ProjectKind;
  status: ProjectStatus;
  title: string;
  organization: string;
  summary: string;
  bodyMarkdown: string;
  startedOn: string;
  endedOn: string;
  publishedAt: string | null;
  sortOrder: number;
  featured: boolean;
  technologies: string[];
  links: EditorProjectLink[];
  updatedAt: string | null;
};

type ProjectSummary = Pick<
  EditorProject,
  | "id"
  | "slug"
  | "kind"
  | "status"
  | "title"
  | "organization"
  | "publishedAt"
  | "sortOrder"
  | "featured"
  | "updatedAt"
>;

type ProjectSaveResult =
  | { status: "saved"; project: EditorProject }
  | { status: "conflict"; message: string }
  | { status: "error"; message: string };

type ProjectSaveOutcome = {
  project: EditorProject;
  changedDuringRequest: boolean;
};

type PublicationAction = "publish" | "schedule" | "unpublish" | "archive";

export async function saveAndPreviewProject(
  save: () => Promise<ProjectSaveOutcome | null>,
  prepare: () => ReturnType<typeof preparePreviewWindow> = preparePreviewWindow
) {
  const preview = prepare();
  let saved: ProjectSaveOutcome | null;
  try {
    saved = await save();
  } catch {
    preview.cancel();
    return false;
  }
  if (!saved || saved.changedDuringRequest || !saved.project.id) {
    preview.cancel();
    return false;
  }
  preview.show(`/admin/preview/work/${saved.project.id}`);
  return true;
}

function blankProject(): EditorProject {
  return {
    id: null,
    slug: "",
    kind: "project",
    status: "draft",
    title: "",
    organization: "",
    summary: "",
    bodyMarkdown: "",
    startedOn: "",
    endedOn: "",
    publishedAt: null,
    sortOrder: 0,
    featured: false,
    technologies: [],
    links: [],
    updatedAt: null,
  };
}

function nullable(value: string) {
  return value.trim() || null;
}

function normalizeLink(value: Record<string, unknown>): EditorProjectLink {
  const kinds = new Set<ProjectLinkKind>([
    "repository",
    "live",
    "demo",
    "writeup",
    "other",
  ]);
  return {
    kind:
      typeof value.kind === "string" && kinds.has(value.kind as ProjectLinkKind)
        ? (value.kind as ProjectLinkKind)
        : "other",
    label: typeof value.label === "string" ? value.label : "",
    url: typeof value.url === "string" ? value.url : "",
    sortOrder: typeof value.sortOrder === "number" ? value.sortOrder : 0,
  };
}

function normalizeProject(value: Record<string, unknown>): EditorProject {
  const status = value.status;
  return {
    id: typeof value.id === "string" ? value.id : null,
    slug: typeof value.slug === "string" ? value.slug : "",
    kind: value.kind === "experience" ? "experience" : "project",
    status:
      status === "scheduled" || status === "published" || status === "archived"
        ? status
        : "draft",
    title: typeof value.title === "string" ? value.title : "",
    organization:
      typeof value.organization === "string" ? value.organization : "",
    summary: typeof value.summary === "string" ? value.summary : "",
    bodyMarkdown:
      typeof value.bodyMarkdown === "string" ? value.bodyMarkdown : "",
    startedOn:
      typeof value.startedOn === "string" ? value.startedOn.slice(0, 10) : "",
    endedOn:
      typeof value.endedOn === "string" ? value.endedOn.slice(0, 10) : "",
    publishedAt:
      typeof value.publishedAt === "string" ? value.publishedAt : null,
    sortOrder: typeof value.sortOrder === "number" ? value.sortOrder : 0,
    featured: value.featured === true,
    technologies: Array.isArray(value.technologies)
      ? value.technologies.filter(
          (technology): technology is string => typeof technology === "string"
        )
      : [],
    links: Array.isArray(value.links)
      ? value.links
          .filter(
            (link): link is Record<string, unknown> =>
              Boolean(link) && typeof link === "object"
          )
          .map(normalizeLink)
      : [],
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
  };
}

export function parseTechnologyInput(value: string) {
  return value
    .split(",")
    .map((technology) => technology.trim())
    .filter(Boolean);
}

function formatDateTimeLocal(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const part = (number: number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(
    date.getDate()
  )}T${part(date.getHours())}:${part(date.getMinutes())}`;
}

function parseDateTimeLocal(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function projectMutation(
  project: EditorProject,
  technologiesInput: string,
  bodyMarkdown: string
) {
  return {
    slug: project.slug.trim(),
    kind: project.kind,
    status: project.status,
    title: project.title.trim(),
    organization: nullable(project.organization),
    summary: nullable(project.summary),
    bodyMarkdown,
    startedOn: nullable(project.startedOn),
    endedOn: nullable(project.endedOn),
    publishedAt: project.publishedAt,
    sortOrder: project.sortOrder,
    featured: project.featured,
    technologies: parseTechnologyInput(technologiesInput),
    links: project.links.map((link) => ({
      kind: link.kind,
      label: link.label.trim(),
      url: link.url.trim(),
      sortOrder: link.sortOrder,
    })),
  };
}

async function projectPayload(response: Response) {
  return response.json().catch(() => null) as Promise<{
    error?: string;
    issues?: unknown;
    project?: Record<string, unknown>;
    projects?: Record<string, unknown>[];
  } | null>;
}

function firstIssue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const message = firstIssue(item);
      if (message) return message;
    }
    return undefined;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) {
      const message = firstIssue(item);
      if (message) return message;
    }
  }
  return undefined;
}

export function projectSaveMessage(
  payload: { error?: string; issues?: unknown } | null,
  status: number
) {
  return (
    firstIssue(payload?.issues) ??
    payload?.error ??
    `Could not save project (${status})`
  );
}

export function reconcileSavedProject(
  local: EditorProject,
  saved: EditorProject,
  changedDuringRequest: boolean
) {
  if (!changedDuringRequest) return saved;
  return {
    ...local,
    id: saved.id,
    status: saved.status,
    publishedAt: saved.publishedAt,
    updatedAt: saved.updatedAt,
  };
}

export async function persistProject(
  project: EditorProject,
  technologiesInput: string,
  bodyMarkdown: string,
  fetcher: typeof fetch = fetch
): Promise<ProjectSaveResult> {
  const creating = !project.id;
  if (!creating && !project.updatedAt) {
    return { status: "error", message: "Reload this project before saving" };
  }
  const mutation = projectMutation(project, technologiesInput, bodyMarkdown);
  const requestBody = creating
    ? { ...mutation, status: "draft" as const, publishedAt: null }
    : { expectedUpdatedAt: project.updatedAt, project: mutation };
  try {
    const response = await fetcher(
      creating ? "/api/admin/projects" : `/api/admin/projects/${project.id}`,
      {
        method: creating ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      }
    );
    const payload = await projectPayload(response);
    if (response.status === 409) {
      return {
        status: "conflict",
        message: payload?.error ?? "Project changed in another session",
      };
    }
    if (!response.ok || !payload?.project) {
      return {
        status: "error",
        message: projectSaveMessage(payload, response.status),
      };
    }
    return { status: "saved", project: normalizeProject(payload.project) };
  } catch {
    return { status: "error", message: "Network request failed" };
  }
}

export function applyProjectPublicationAction(
  project: EditorProject,
  action: PublicationAction,
  scheduleInput: string,
  now = new Date()
): { project: EditorProject } | { error: string } {
  if (action === "publish") {
    return {
      project: { ...project, status: "published", publishedAt: now.toISOString() },
    };
  }
  if (action === "schedule") {
    if (!scheduleInput) return { error: "Choose a schedule time" };
    const scheduledAt = parseDateTimeLocal(scheduleInput);
    if (!scheduledAt) return { error: "Choose a valid schedule time" };
    if (new Date(scheduledAt).getTime() <= now.getTime()) {
      return { error: "Schedule time must be in the future" };
    }
    return {
      project: { ...project, status: "scheduled", publishedAt: scheduledAt },
    };
  }
  if (action === "unpublish") {
    return { project: { ...project, status: "draft", publishedAt: null } };
  }
  return { project: { ...project, status: "archived" } };
}

export default function WorkEditor() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [project, setProject] = useState<EditorProject>(blankProject);
  const [technologiesInput, setTechnologiesInput] = useState("");
  const [publicationInput, setPublicationInput] = useState("");
  const [documentGeneration, setDocumentGeneration] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("");
  const bodySnapshotRef = useRef<MarkdownSnapshot>(() => "");
  const editGeneration = useRef(0);

  async function loadProjects() {
    try {
      const response = await fetch("/api/admin/projects", { cache: "no-store" });
      const payload = await projectPayload(response);
      if (!response.ok) {
        setMessage(payload?.error ?? `Could not load projects (${response.status})`);
        return;
      }
      setProjects(
        (payload?.projects ?? []).map(
          (item) => normalizeProject(item) as ProjectSummary
        )
      );
    } catch {
      setMessage("Network request failed");
    }
  }

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  function replaceProject(next: EditorProject) {
    editGeneration.current += 1;
    setProject(next);
    setTechnologiesInput(next.technologies.join(", "));
    setPublicationInput(formatDateTimeLocal(next.publishedAt));
    setDocumentGeneration((generation) => generation + 1);
    setDirty(false);
    setConflict(false);
  }

  function markDirty() {
    editGeneration.current += 1;
    setDirty(true);
    setMessage("");
  }

  function updateProject(changes: Partial<EditorProject>) {
    setProject((current) => ({ ...current, ...changes }));
    markDirty();
  }

  function canReplaceProject() {
    return !dirty || window.confirm("Discard unsaved project changes?");
  }

  function startNewProject() {
    if (!canReplaceProject()) return;
    replaceProject(blankProject());
    setMessage("New project draft");
  }

  async function loadProject(id: string, confirmed = false) {
    if (!confirmed && !canReplaceProject()) return;
    const requestedEditGeneration = editGeneration.current;
    const requestedBodyMarkdown = bodySnapshotRef.current(false);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/projects/${id}`, {
        cache: "no-store",
      });
      const payload = await projectPayload(response);
      if (!response.ok || !payload?.project) {
        setMessage(payload?.error ?? `Could not load project (${response.status})`);
        return;
      }
      if (
        editGeneration.current !== requestedEditGeneration ||
        bodySnapshotRef.current(false) !== requestedBodyMarkdown
      ) {
        setMessage("Project not loaded because local changes were made");
        return;
      }
      replaceProject(normalizeProject(payload.project));
    } catch {
      setMessage("Network request failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveProject(
    candidate = project,
    successMessage = candidate.id ? "Project saved" : "Draft created"
  ) {
    if (!candidate.title.trim() || !candidate.slug.trim()) {
      setMessage("Title and slug are required");
      return null;
    }
    if (
      (candidate.status === "scheduled" || candidate.status === "published") &&
      !candidate.publishedAt
    ) {
      setMessage("Scheduled and published projects need a publication time");
      return null;
    }
    setBusy(true);
    setMessage("");
    const submittedEditGeneration = editGeneration.current;
    const submittedBodyMarkdown = bodySnapshotRef.current(false);
    const result = await persistProject(
      candidate,
      technologiesInput,
      bodySnapshotRef.current(true)
    );
    if (result.status === "saved") {
      const changedDuringRequest =
        editGeneration.current !== submittedEditGeneration ||
        bodySnapshotRef.current(false) !== submittedBodyMarkdown;
      if (changedDuringRequest) {
        setProject((current) =>
          reconcileSavedProject(current, result.project, true)
        );
        setDirty(true);
        setConflict(false);
        setMessage(`${successMessage}; newer local edits remain unsaved`);
      } else {
        replaceProject(result.project);
        setMessage(successMessage);
      }
      void loadProjects();
      setBusy(false);
      return { project: result.project, changedDuringRequest };
    }
    setConflict(result.status === "conflict");
    setMessage(result.message);
    setBusy(false);
    return null;
  }

  async function runPublicationAction(action: PublicationAction) {
    if (!project.id) {
      setMessage("Create the draft before changing publication status");
      return;
    }
    const result = applyProjectPublicationAction(
      project,
      action,
      publicationInput
    );
    if ("error" in result) {
      setMessage(result.error);
      return;
    }
    const labels: Record<PublicationAction, string> = {
      publish: "Project published",
      schedule: "Project scheduled",
      unpublish: "Project returned to draft",
      archive: "Project archived",
    };
    await saveProject(result.project, labels[action]);
  }

  async function deleteProject() {
    if (!project.id || !project.updatedAt) {
      setMessage("Choose a saved project to delete");
      return;
    }
    const confirmation = window.prompt(
      `Type ${project.slug} to permanently delete this project.`
    );
    if (confirmation === null) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/projects/${project.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedUpdatedAt: project.updatedAt,
          confirmation,
        }),
      });
      const payload = response.status === 204 ? null : await projectPayload(response);
      if (response.status === 409) {
        setConflict(true);
        setMessage(payload?.error ?? "Project changed in another session");
        return;
      }
      if (!response.ok) {
        setMessage(payload?.error ?? `Could not delete project (${response.status})`);
        return;
      }
      replaceProject(blankProject());
      setMessage("Project deleted");
      await loadProjects();
    } catch {
      setMessage("Network request failed");
    } finally {
      setBusy(false);
    }
  }

  function updateLink(index: number, changes: Partial<EditorProjectLink>) {
    updateProject({
      links: project.links.map((link, linkIndex) =>
        linkIndex === index ? { ...link, ...changes } : link
      ),
    });
  }

  function addLink() {
    updateProject({
      links: [
        ...project.links,
        {
          kind: "other",
          label: "",
          url: "",
          sortOrder: project.links.length,
        },
      ],
    });
  }

  function removeLink(index: number) {
    updateProject({ links: project.links.filter((_, linkIndex) => linkIndex !== index) });
  }

  function changePublicationInput(value: string) {
    setPublicationInput(value);
    updateProject({ publishedAt: parseDateTimeLocal(value) });
  }

  function changeStatus(status: ProjectStatus) {
    if (status === "draft") {
      setPublicationInput("");
      updateProject({ status, publishedAt: null });
      return;
    }
    updateProject({ status });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveProject();
  }

  async function previewProject() {
    await saveAndPreviewProject(() => saveProject());
  }

  return (
    <AdminShell
      activeTab="work"
      description="Projects, experience, technologies, and links"
      beforeSignOut={() =>
        !dirty || window.confirm("Discard unsaved project changes?")
      }
    >
      <div className="work-admin">
        <aside className="work-admin-list" aria-label="Projects">
          <div className="work-admin-list-heading">
            <h2>Work</h2>
            <button type="button" onClick={startNewProject} disabled={busy}>
              New project
            </button>
          </div>
          {projects.length === 0 ? (
            <p className="admin-meta">No database projects yet.</p>
          ) : (
            <ul>
              {projects.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={project.id === item.id ? "is-active" : undefined}
                    onClick={() => item.id && void loadProject(item.id)}
                    disabled={busy}
                  >
                    <span>{item.title}</span>
                    <small>{item.status}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <form className="work-admin-form" onSubmit={(event) => void submit(event)}>
          <div className="work-admin-heading">
            <div>
              <h2>{project.id ? project.title || "Untitled project" : "New project"}</h2>
              <p className="admin-meta">
                {project.updatedAt
                  ? `Updated ${new Date(project.updatedAt).toLocaleString()}`
                  : "Unsaved draft"}
              </p>
            </div>
            <span className={`work-status work-status-${project.status}`}>
              {project.status}
            </span>
          </div>

          <section className="work-admin-section">
            <h3>Project details</h3>
            <div className="work-admin-grid">
              <label>
                Title
                <input
                  required
                  value={project.title}
                  onChange={(event) => updateProject({ title: event.target.value })}
                  disabled={busy}
                />
              </label>
              <label>
                Slug
                <input
                  required
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  value={project.slug}
                  onChange={(event) => updateProject({ slug: event.target.value })}
                  disabled={busy}
                />
              </label>
              <label>
                Type
                <select
                  value={project.kind}
                  onChange={(event) =>
                    updateProject({ kind: event.target.value as ProjectKind })
                  }
                  disabled={busy}
                >
                  <option value="project">Project</option>
                  <option value="experience">Experience</option>
                </select>
              </label>
              <label>
                Organization
                <input
                  value={project.organization}
                  onChange={(event) =>
                    updateProject({ organization: event.target.value })
                  }
                  disabled={busy}
                />
              </label>
              <label>
                Started
                <input
                  type="date"
                  value={project.startedOn}
                  onChange={(event) => updateProject({ startedOn: event.target.value })}
                  disabled={busy}
                />
              </label>
              <label>
                Ended
                <input
                  type="date"
                  value={project.endedOn}
                  onChange={(event) => updateProject({ endedOn: event.target.value })}
                  disabled={busy}
                />
              </label>
              <label>
                Sort order
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={project.sortOrder}
                  onChange={(event) =>
                    updateProject({ sortOrder: Number(event.target.value) })
                  }
                  disabled={busy}
                />
              </label>
              <label className="work-checkbox">
                <input
                  type="checkbox"
                  checked={project.featured}
                  onChange={(event) => updateProject({ featured: event.target.checked })}
                  disabled={busy}
                />
                Featured
              </label>
            </div>
            <label>
              Summary
              <textarea
                rows={3}
                maxLength={500}
                value={project.summary}
                onChange={(event) => updateProject({ summary: event.target.value })}
                disabled={busy}
              />
            </label>
            <label>
              Technologies
              <input
                value={technologiesInput}
                placeholder="TypeScript, Postgres, OpenAI"
                onChange={(event) => {
                  setTechnologiesInput(event.target.value);
                  markDirty();
                }}
                disabled={busy}
              />
            </label>
          </section>

          <section className="work-admin-section">
            <h3>Body</h3>
            <MarkdownEditor
              documentKey={`${project.id ?? "new"}-${documentGeneration}`}
              value={project.bodyMarkdown}
              onChange={(bodyMarkdown) =>
                setProject((current) => ({ ...current, bodyMarkdown }))
              }
              onDirty={markDirty}
              snapshotRef={bodySnapshotRef}
            />
          </section>

          <section className="work-admin-section">
            <div className="work-admin-section-heading">
              <h3>Project links</h3>
              <button type="button" onClick={addLink} disabled={busy}>
                Add link
              </button>
            </div>
            {project.links.length === 0 ? (
              <p className="admin-meta">No links added.</p>
            ) : (
              <div className="work-links">
                {project.links.map((link, index) => (
                  <div className="work-link" key={`${index}-${link.kind}`}>
                    <label>
                      Kind
                      <select
                        value={link.kind}
                        onChange={(event) =>
                          updateLink(index, {
                            kind: event.target.value as ProjectLinkKind,
                          })
                        }
                        disabled={busy}
                      >
                        <option value="repository">Repository</option>
                        <option value="live">Live</option>
                        <option value="demo">Demo</option>
                        <option value="writeup">Writeup</option>
                        <option value="other">Other</option>
                      </select>
                    </label>
                    <label>
                      Label
                      <input
                        required
                        value={link.label}
                        onChange={(event) =>
                          updateLink(index, { label: event.target.value })
                        }
                        disabled={busy}
                      />
                    </label>
                    <label className="work-link-url">
                      URL
                      <input
                        required
                        type="url"
                        value={link.url}
                        onChange={(event) =>
                          updateLink(index, { url: event.target.value })
                        }
                        disabled={busy}
                      />
                    </label>
                    <label>
                      Order
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={link.sortOrder}
                        onChange={(event) =>
                          updateLink(index, {
                            sortOrder: Number(event.target.value),
                          })
                        }
                        disabled={busy}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => removeLink(index)}
                      disabled={busy}
                    >
                      Remove link
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="work-admin-section">
            <h3>Publication</h3>
            <div className="work-admin-grid publication-grid">
              <label>
                Status
                <select
                  value={project.status}
                  onChange={(event) =>
                    changeStatus(event.target.value as ProjectStatus)
                  }
                  disabled={busy || !project.id}
                >
                  <option value="draft">Draft</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label>
                Publication time
                <input
                  type="datetime-local"
                  value={publicationInput}
                  onChange={(event) => changePublicationInput(event.target.value)}
                  disabled={busy || !project.id}
                />
              </label>
            </div>
            <div className="work-publication-actions">
              <button
                type="button"
                onClick={() => void runPublicationAction("publish")}
                disabled={busy || !project.id}
              >
                Publish now
              </button>
              <button
                type="button"
                onClick={() => void runPublicationAction("schedule")}
                disabled={busy || !project.id}
              >
                Schedule
              </button>
              <button
                type="button"
                onClick={() => void runPublicationAction("unpublish")}
                disabled={busy || !project.id}
              >
                Unpublish
              </button>
              <button
                type="button"
                onClick={() => void runPublicationAction("archive")}
                disabled={busy || !project.id}
              >
                Archive
              </button>
            </div>
          </section>

          <div className="work-admin-actions">
            <button type="submit" disabled={busy || conflict || !dirty}>
              {project.id ? "Save project" : "Create draft"}
            </button>
            <button
              type="button"
              onClick={() => void previewProject()}
              disabled={busy || conflict}
            >
              Save &amp; Preview
            </button>
            {conflict && project.id && (
              <button
                type="button"
                onClick={() => void loadProject(project.id!, true)}
                disabled={busy}
              >
                Reload server version
              </button>
            )}
            <button
              type="button"
              className="work-delete"
              onClick={() => void deleteProject()}
              disabled={busy || !project.id}
            >
              Delete
            </button>
            <span className="admin-meta">
              {busy ? "Working" : conflict ? "Server version changed" : dirty ? "Unsaved changes" : "Saved"}
            </span>
          </div>
          {message && (
            <p className="admin-message" role="status">
              {message}
            </p>
          )}
        </form>
      </div>
      <style>{`
        .work-admin { display: grid; grid-template-columns: minmax(13rem, 0.32fr) minmax(0, 1fr); gap: 2rem; margin-top: 1.5rem; }
        .work-admin-list { border-right: 1px solid var(--hairline); padding-right: 1.25rem; }
        .work-admin-list-heading, .work-admin-heading, .work-admin-section-heading { display: flex; align-items: start; justify-content: space-between; gap: 1rem; }
        .work-admin h2, .work-admin h3 { margin: 0; }
        .work-admin h2 { font-size: 1.2rem; }
        .work-admin h3 { font-size: 0.95rem; }
        .work-admin-list ul { list-style: none; margin: 1rem 0 0; padding: 0; display: grid; gap: 0.4rem; }
        .work-admin-list li button { width: 100%; display: flex; justify-content: space-between; gap: 0.5rem; text-align: left; background: transparent; border-color: transparent; }
        .work-admin-list li button:hover, .work-admin-list li button.is-active { background: var(--code-bg); border-color: var(--hairline); }
        .work-admin-list small { color: var(--muted); text-transform: capitalize; }
        .work-admin-form { display: grid; gap: 1.5rem; min-width: 0; }
        .work-status { color: var(--muted); font: 0.72rem var(--mono); text-transform: uppercase; letter-spacing: 0.06em; }
        .work-admin-section { display: grid; gap: 0.85rem; padding-top: 1.15rem; border-top: 1px solid var(--hairline); }
        .work-admin-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.75rem; }
        .work-admin-form label { display: grid; gap: 0.3rem; color: var(--muted); font: 0.75rem var(--mono); }
        .work-admin-form input, .work-admin-form select, .work-admin-form textarea { width: 100%; padding: 0.5rem 0.6rem; border: 1px solid var(--hairline); border-radius: 4px; color: var(--ink); background: var(--bg); font: inherit; }
        .work-admin-form textarea { resize: vertical; line-height: 1.5; }
        .work-checkbox { display: flex !important; align-items: center; align-self: end; min-height: 2.25rem; grid-template-columns: auto 1fr; }
        .work-checkbox input { width: auto; }
        .work-links { display: grid; gap: 0.75rem; }
        .work-link { display: grid; grid-template-columns: minmax(7rem, 0.6fr) minmax(8rem, 0.8fr) minmax(12rem, 1.7fr) 5rem auto; gap: 0.6rem; align-items: end; padding: 0.75rem; border: 1px solid var(--hairline); }
        .work-publication-actions, .work-admin-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 0.65rem; }
        .work-admin-actions { padding-top: 1rem; border-top: 1px solid var(--hairline); }
        .work-delete { margin-left: auto; color: #9d3027 !important; }
        @media (max-width: 900px) { .work-link { grid-template-columns: repeat(2, minmax(0, 1fr)); } .work-link-url { grid-column: 1 / -1; } }
        @media (max-width: 760px) { .work-admin { grid-template-columns: 1fr; } .work-admin-list { border-right: 0; border-bottom: 1px solid var(--hairline); padding: 0 0 1.25rem; } .work-admin-grid, .work-link { grid-template-columns: 1fr; } .work-link-url { grid-column: auto; } .work-delete { margin-left: 0; } }
      `}</style>
    </AdminShell>
  );
}
