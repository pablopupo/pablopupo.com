"use client";

import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import {
  canStartDocumentDelete,
  canStartDocumentSave,
  deletedDocumentDisposition,
  dirtyPersistenceState,
  failedSaveState,
  hasPendingEditorChanges,
  isSaveShortcut,
  isScheduleInputDirty,
  nextEditSequence,
  persistenceLabel,
  reconcilePublishedEntry,
  reconcileSavedEntry,
  scheduleAutosaveTimer,
  shouldRunSaveShortcut,
  shouldScheduleAutosave,
  shouldWarnBeforeUnload,
  successfulSaveState,
  revisionRestoreDisposition,
  type PersistenceStatus,
  type PersistenceState,
} from "./editor-persistence";
import MarkdownEditor, { type MarkdownSnapshot } from "./markdown-editor";

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
  section: "writing" | "music";
  tags: string[];
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
  "id" | "slug" | "kind" | "section" | "tags" | "status" | "title" | "publishedAt" | "updatedAt" | "version"
>;

type RevisionSummary = {
  revisionNumber: number;
  status: EditorEntry["status"];
  title: string;
  createdAt: string;
};

type RevisionPerformanceDetails = {
  workTitle: string;
  composer: string;
  venue: string | null;
  performedAt: string | null;
  youtubeUrl: string;
  notesMarkdown: string | null;
};

type RevisionSnapshot = {
  revisionNumber: number;
  slug: string;
  kind: EditorEntry["kind"];
  section: EditorEntry["section"];
  tags: string[];
  status: EditorEntry["status"];
  title: string;
  summary: string | null;
  bodyMarkdown: string;
  performanceDetails: RevisionPerformanceDetails | null;
  createdAt: string;
};

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
    section: "writing",
    tags: [],
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

export function parseTagInput(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function nextDocumentGeneration(current: number, replace: boolean) {
  return replace ? current + 1 : current;
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

export function shouldRestoreRevision(
  revisionNumber: number,
  confirmRestore: (message: string) => boolean = (message) =>
    window.confirm(message)
) {
  return confirmRestore(
    `Restore revision ${revisionNumber}? Current content will become a new revision.`
  );
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
    section: value.section === "music" ? "music" : "writing",
    tags: Array.isArray(value.tags)
      ? value.tags.filter((tag): tag is string => typeof tag === "string")
      : [],
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

function mutation(entry: EditorEntry, tagsInput: string) {
  return {
    slug: entry.slug,
    kind: entry.kind,
    section: entry.section,
    tags: parseTagInput(tagsInput),
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
    revisions?: RevisionSummary[];
    revision?: RevisionSnapshot;
  } | null>;
}

export default function Editor({ mode, configurationStatus }: EditorProps) {
  const [entries, setEntries] = useState<EntrySummary[]>([]);
  const [entry, setEntry] = useState<EditorEntry>(blankEntry);
  const [scheduledAt, setScheduledAt] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [documentGeneration, setDocumentGeneration] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [persistenceStatus, setPersistenceStatus] =
    useState<PersistenceStatus>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [autosavePaused, setAutosavePaused] = useState(false);
  const [scheduleDirty, setScheduleDirty] = useState(false);
  const [editSequence, setEditSequence] = useState(0);
  const [saveRetrySequence, setSaveRetrySequence] = useState(0);
  const [revisions, setRevisions] = useState<RevisionSummary[]>([]);
  const [revisionPreview, setRevisionPreview] =
    useState<RevisionSnapshot | null>(null);
  const editGeneration = useRef(0);
  const lastEditAt = useRef(0);
  const scheduledAtBaseline = useRef("");
  const scheduledAtSnapshot = useRef("");
  const documentEpoch = useRef(0);
  const bodyMarkdownSnapshot = useRef<MarkdownSnapshot>(() => "");
  const activeSaveEpochs = useRef(new Set<number>());
  const queuedSaveEpochs = useRef(new Set<number>());
  const saveRef = useRef<(source?: "manual" | "autosave") => Promise<void>>(
    async () => undefined
  );

  function runBusy<T>(operation: () => Promise<T>) {
    return runBusyEditorOperation(operation, setBusy, setMessage);
  }

  function applyPersistenceState(state: PersistenceState) {
    setDirty(state.dirty);
    setPersistenceStatus(state.status);
    setAutosavePaused(state.paused);
  }

  function markDirty() {
    editGeneration.current += 1;
    lastEditAt.current = Date.now();
    setEditSequence((current) => nextEditSequence(current));
    applyPersistenceState(
      dirtyPersistenceState({
        dirty: true,
        status: persistenceStatus,
        paused: autosavePaused,
      })
    );
  }

  function markDocumentReplacement() {
    documentEpoch.current += 1;
    editGeneration.current += 1;
    setDocumentGeneration((generation) =>
      nextDocumentGeneration(generation, true)
    );
    applyPersistenceState({ dirty: false, status: "saved", paused: false });
    setLastSavedAt(null);
  }

  function changeEntry(changes: Partial<EditorEntry>) {
    setEntry((current) => ({ ...current, ...changes }));
    markDirty();
  }

  function changePerformance(changes: Partial<PerformanceFields>) {
    setEntry((current) => ({
      ...current,
      performance: { ...current.performance, ...changes },
    }));
    markDirty();
  }

  function changeScheduledAt(value: string) {
    scheduledAtSnapshot.current = value;
    setScheduledAt(value);
    setScheduleDirty(
      isScheduleInputDirty(value, scheduledAtBaseline.current)
    );
  }

  function adoptScheduledAt(value: string, preserveLocal = false) {
    scheduledAtBaseline.current = value;
    if (!preserveLocal) {
      scheduledAtSnapshot.current = value;
      setScheduledAt(value);
    }
    setScheduleDirty(
      isScheduleInputDirty(scheduledAtSnapshot.current, value)
    );
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

  async function loadRevisions(id: string, epoch = documentEpoch.current) {
    try {
      const response = await fetch(`/api/admin/entries/${id}/revisions`, {
        cache: "no-store",
      });
      const payload = await responsePayload(response);
      if (documentEpoch.current !== epoch) return;
      if (!response.ok) {
        setMessage(
          payload?.error ?? `Could not load revisions (${response.status})`
        );
        return;
      }
      setRevisions(payload?.revisions ?? []);
    } catch {
      if (documentEpoch.current === epoch) {
        setMessage("Network request failed");
      }
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
    if (
      !shouldDiscardUnsavedChanges(
        hasPendingEditorChanges(dirty, scheduleDirty)
      )
    ) {
      return;
    }
    await runBusy(async () => {
      setMessage("");
      await authClient.signOut();
      window.location.assign("/admin");
    });
  }

  async function loadEntry(id: string, discardConfirmed = false) {
    if (
      !discardConfirmed &&
      !shouldDiscardUnsavedChanges(
        hasPendingEditorChanges(dirty, scheduleDirty)
      )
    ) {
      return;
    }
    const requestedDocumentEpoch = documentEpoch.current;
    const requestedEditGeneration = editGeneration.current;
    const requestedScheduledAt = scheduledAtSnapshot.current;
    const requestedBodyMarkdown = bodyMarkdownSnapshot.current(false);
    await runBusy(async () => {
      setMessage("");
      const response = await fetch(`/api/admin/entries/${id}`, {
        cache: "no-store",
      });
      const payload = await responsePayload(response);
      if (documentEpoch.current !== requestedDocumentEpoch) return;
      if (response.ok && payload?.entry) {
        if (
          editGeneration.current !== requestedEditGeneration ||
          bodyMarkdownSnapshot.current(false) !== requestedBodyMarkdown ||
          scheduledAtSnapshot.current !== requestedScheduledAt
        ) {
          setMessage("Entry not loaded because local changes were made");
          return;
        }
        const loaded = normalizeEntry(payload.entry);
        setEntry(loaded);
        setTagsInput(loaded.tags.join(", "));
        markDocumentReplacement();
        const epoch = documentEpoch.current;
        adoptScheduledAt(
          formatDateTimeLocal(payload.entry.publishedAt as string | null)
        );
        setRevisionPreview(null);
        setRevisions([]);
        void loadRevisions(id, epoch);
      } else {
        setMessage(payload?.error ?? "Could not load entry");
      }
    });
  }

  async function save(source: "manual" | "autosave" = "manual") {
    if (!entry.slug.trim() || !entry.title.trim()) {
      setMessage("Title and slug are required");
      return;
    }
    const requestedDocumentEpoch = documentEpoch.current;
    if (
      !canStartDocumentSave(
        activeSaveEpochs.current,
        requestedDocumentEpoch
      )
    ) {
      queuedSaveEpochs.current.add(requestedDocumentEpoch);
      return;
    }
    activeSaveEpochs.current.add(requestedDocumentEpoch);
    if (source === "manual") setBusy(true);
    setMessage("");
    setPersistenceStatus("saving");

    const submittedEntry = {
      ...entry,
      bodyMarkdown: bodyMarkdownSnapshot.current(true),
    };
    const submittedTagsInput = tagsInput;
    const submittedEditGeneration = editGeneration.current;
    const submittedDocumentEpoch = requestedDocumentEpoch;
    const creating = !submittedEntry.id;
    let retryQueuedSave = false;

    try {
      const response = await fetch(
        creating
          ? "/api/admin/entries"
          : `/api/admin/entries/${submittedEntry.id}`,
        {
          method: creating ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            creating
              ? {
                  slug: submittedEntry.slug,
                  title: submittedEntry.title,
                  kind: submittedEntry.kind,
                  section: submittedEntry.section,
                  tags: parseTagInput(submittedTagsInput),
                  summary: submittedEntry.summary || null,
                  bodyMarkdown: submittedEntry.bodyMarkdown,
                  performance: mutation(submittedEntry, submittedTagsInput)
                    .performance,
                }
              : {
                  expectedVersion: submittedEntry.version,
                  entry: mutation(submittedEntry, submittedTagsInput),
                }
          ),
        }
      );
      const payload = await responsePayload(response);
      if (documentEpoch.current !== submittedDocumentEpoch) return;

      if (response.status === 409) {
        applyPersistenceState(failedSaveState(true));
        setMessage(
          payload?.error ?? "Conflict: entry changed in another session"
        );
        return;
      }
      if (!response.ok || !payload?.entry) {
        applyPersistenceState(failedSaveState(false));
        setMessage(payload?.error ?? `Save failed (${response.status})`);
        return;
      }

      const saved = normalizeEntry(payload.entry);
      const changedDuringRequest =
        editGeneration.current !== submittedEditGeneration;
      setEntry((current) =>
        reconcileSavedEntry(current, saved, changedDuringRequest)
      );
      if (!changedDuringRequest) {
        setTagsInput(saved.tags.join(", "));
      }
      applyPersistenceState(successfulSaveState(changedDuringRequest));
      retryQueuedSave = true;
      setLastSavedAt(new Date());
      setMessage(creating ? "Draft created" : "Saved");
      void loadEntries();
      const savedId = saved.id ?? submittedEntry.id;
      if (savedId) void loadRevisions(savedId, submittedDocumentEpoch);
    } catch {
      if (documentEpoch.current === submittedDocumentEpoch) {
        applyPersistenceState(failedSaveState(false));
        setMessage("Network request failed");
      }
    } finally {
      activeSaveEpochs.current.delete(submittedDocumentEpoch);
      const saveWasQueued = queuedSaveEpochs.current.delete(
        submittedDocumentEpoch
      );
      if (
        retryQueuedSave &&
        saveWasQueued &&
        documentEpoch.current === submittedDocumentEpoch
      ) {
        setSaveRetrySequence((current) => current + 1);
      }
      if (source === "manual") setBusy(false);
    }
  }

  saveRef.current = save;

  async function previewRevision(revisionNumber: number) {
    if (!entry.id) return;
    const id = entry.id;
    const epoch = documentEpoch.current;
    await runBusy(async () => {
      setMessage("");
      const response = await fetch(
        `/api/admin/entries/${id}/revisions/${revisionNumber}`,
        { cache: "no-store" }
      );
      const payload = await responsePayload(response);
      if (documentEpoch.current !== epoch) return;
      if (response.ok && payload?.revision) {
        setRevisionPreview(payload.revision);
      } else {
        setMessage(payload?.error ?? "Could not load revision");
      }
    });
  }

  async function restoreRevision(revisionNumber: number) {
    if (
      !entry.id ||
      hasPendingEditorChanges(dirty, scheduleDirty) ||
      !shouldRestoreRevision(revisionNumber)
    ) {
      return;
    }
    const id = entry.id;
    const expectedVersion = entry.version;
    const epoch = documentEpoch.current;
    const requestedEditGeneration = editGeneration.current;
    const requestedScheduledAt = scheduledAtSnapshot.current;
    const requestedBodyMarkdown = bodyMarkdownSnapshot.current(false);
    await runBusy(async () => {
      setMessage("");
      const response = await fetch(
        `/api/admin/entries/${id}/revisions/${revisionNumber}/restore`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedVersion }),
        }
      );
      const payload = await responsePayload(response);
      if (documentEpoch.current !== epoch) return;
      if (response.status === 409) {
        applyPersistenceState(failedSaveState(true));
        setMessage(
          payload?.error ?? "Conflict: entry changed in another session"
        );
        return;
      }
      if (!response.ok || !payload?.entry) {
        setMessage(payload?.error ?? `Restore failed (${response.status})`);
        return;
      }
      const restored = normalizeEntry(payload.entry);
      const contentChangedDuringRequest =
        editGeneration.current !== requestedEditGeneration ||
        bodyMarkdownSnapshot.current(false) !== requestedBodyMarkdown;
      const scheduleChangedDuringRequest =
        scheduledAtSnapshot.current !== requestedScheduledAt;
      const disposition = revisionRestoreDisposition({
        contentChanged: contentChangedDuringRequest,
        scheduleChanged: scheduleChangedDuringRequest,
      });
      setEntry((current) =>
        reconcilePublishedEntry(
          current,
          restored,
          disposition.preserveLocalContent
        )
      );
      if (disposition.dirty) {
        applyPersistenceState(successfulSaveState(true));
      } else {
        setTagsInput(restored.tags.join(", "));
        markDocumentReplacement();
      }
      adoptScheduledAt(
        formatDateTimeLocal(restored.publishedAt),
        disposition.preserveSchedule
      );
      const restoredEpoch = documentEpoch.current;
      setLastSavedAt(new Date());
      setRevisionPreview(null);
      setRevisions([]);
      setMessage(
        disposition.dirty
          ? `Revision ${revisionNumber} restored; newer local edits remain unsaved`
          : `Revision ${revisionNumber} restored`
      );
      void loadEntries();
      void loadRevisions(id, restoredEpoch);
    });
  }

  async function reloadServerVersion() {
    if (!entry.id) return;
    if (!window.confirm("Reload server version and discard local changes?")) {
      return;
    }
    await loadEntry(entry.id, true);
  }

  async function runAction(action: "publish" | "schedule" | "unpublish" | "archive" | "duplicate") {
    if (!entry.id) {
      setMessage("Create the draft before using this action");
      return;
    }
    const unsavedMessage = unsavedEntryActionMessage(
      dirty || (scheduleDirty && action !== "schedule")
    );
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
    const id = entry.id;
    const expectedVersion = entry.version;
    const requestedDocumentEpoch = documentEpoch.current;
    const requestedEditGeneration = editGeneration.current;
    const requestedScheduledAt = scheduledAtSnapshot.current;
    const requestedBodyMarkdown = bodyMarkdownSnapshot.current(false);
    await runBusy(async () => {
      setMessage("");
      const response = await fetch(`/api/admin/entries/${id}/actions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          ...(action === "duplicate" ? {} : { expectedVersion }),
          ...(action === "schedule" ? { scheduledAt: scheduleTime } : {}),
        }),
      });
      const payload = await responsePayload(response);
      if (documentEpoch.current !== requestedDocumentEpoch) return;
      if (response.ok && payload?.entry) {
        const updated = normalizeEntry(payload.entry);
        const contentChangedDuringRequest =
          editGeneration.current !== requestedEditGeneration ||
          bodyMarkdownSnapshot.current(false) !== requestedBodyMarkdown;
        const scheduleChangedDuringRequest =
          scheduledAtSnapshot.current !== requestedScheduledAt;
        if (action === "duplicate") {
          if (
            contentChangedDuringRequest ||
            scheduleChangedDuringRequest
          ) {
            if (contentChangedDuringRequest) {
              applyPersistenceState(successfulSaveState(true));
            }
            setMessage("Draft duplicated; newer local changes remain");
            void loadEntries();
            return;
          }
          setEntry(updated);
          setTagsInput(updated.tags.join(", "));
          adoptScheduledAt(formatDateTimeLocal(updated.publishedAt));
          markDocumentReplacement();
          setRevisionPreview(null);
          setRevisions([]);
        } else {
          setEntry((current) =>
            reconcilePublishedEntry(
              current,
              updated,
              contentChangedDuringRequest
            )
          );
          if (!contentChangedDuringRequest) {
            setTagsInput(updated.tags.join(", "));
          }
          adoptScheduledAt(
            formatDateTimeLocal(updated.publishedAt),
            scheduleChangedDuringRequest
          );
          applyPersistenceState(
            successfulSaveState(contentChangedDuringRequest)
          );
        }
        setLastSavedAt(new Date());
        setMessage(
          contentChangedDuringRequest
            ? "Entry updated; newer local edits remain unsaved"
            : action === "duplicate"
              ? "Draft duplicated"
              : "Entry updated"
        );
        void loadEntries();
        if (updated.id) {
          void loadRevisions(updated.id, documentEpoch.current);
        }
      } else if (response.status === 409) {
        applyPersistenceState(failedSaveState(true));
        setMessage(
          payload?.error ?? "Conflict: entry changed in another session"
        );
      } else {
        setMessage(payload?.error ?? `Action failed (${response.status})`);
      }
    });
  }

  async function remove() {
    if (!entry.id) return;
    const epoch = documentEpoch.current;
    if (!canStartDocumentDelete(activeSaveEpochs.current, epoch)) {
      setMessage("Wait for the current save before deleting");
      return;
    }
    if (
      !shouldDiscardUnsavedChanges(
        hasPendingEditorChanges(dirty, scheduleDirty)
      )
    ) {
      return;
    }
    const confirmation = window.prompt(`Type ${entry.slug} to delete this entry`);
    if (confirmation === null) return;
    const id = entry.id;
    const expectedVersion = entry.version;
    const requestedEditGeneration = editGeneration.current;
    const requestedScheduledAt = scheduledAtSnapshot.current;
    const requestedBodyMarkdown = bodyMarkdownSnapshot.current(false);
    activeSaveEpochs.current.add(epoch);
    try {
      await runBusy(async () => {
        setMessage("");
        const response = await fetch(`/api/admin/entries/${id}`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ expectedVersion, confirmation }),
        });
        if (documentEpoch.current !== epoch) return;
        if (response.ok) {
          const latestBodyMarkdown = bodyMarkdownSnapshot.current(false);
          const disposition = deletedDocumentDisposition({
            contentChanged:
              editGeneration.current !== requestedEditGeneration ||
              latestBodyMarkdown !== requestedBodyMarkdown,
            scheduleChanged:
              scheduledAtSnapshot.current !== requestedScheduledAt &&
              isScheduleInputDirty(scheduledAtSnapshot.current, ""),
          });
          if (disposition.retainAsDraft) {
            setEntry((current) => ({
              ...current,
              id: null,
              status: "draft",
              bodyMarkdown: latestBodyMarkdown,
              publishedAt: null,
              updatedAt: null,
              version: 0,
            }));
            adoptScheduledAt("", disposition.preserveSchedule);
            markDocumentReplacement();
            if (disposition.dirty) {
              applyPersistenceState({
                dirty: true,
                status: "unsaved",
                paused: false,
              });
            }
            setMessage("Entry deleted; newer edits retained as a new draft");
          } else {
            setEntry(blankEntry());
            setTagsInput("");
            markDocumentReplacement();
            adoptScheduledAt("");
            setMessage("Entry deleted");
          }
          setRevisionPreview(null);
          setRevisions([]);
          void loadEntries();
          return;
        }
        const payload = await responsePayload(response);
        if (response.status === 409) {
          applyPersistenceState(failedSaveState(true));
        }
        setMessage(payload?.error ?? `Delete failed (${response.status})`);
      });
    } finally {
      activeSaveEpochs.current.delete(epoch);
      queuedSaveEpochs.current.delete(epoch);
    }
  }

  function newEntry() {
    if (
      !shouldDiscardUnsavedChanges(
        hasPendingEditorChanges(dirty, scheduleDirty)
      )
    ) {
      return;
    }
    setEntry(blankEntry());
    setTagsInput("");
    markDocumentReplacement();
    adoptScheduledAt("");
    setRevisionPreview(null);
    setRevisions([]);
    setMessage("");
  }

  useEffect(() => {
    if (saveRetrySequence === 0) return;
    void saveRef.current("autosave");
  }, [saveRetrySequence]);

  useEffect(() => {
    if (mode !== "authorized") return;
    if (
      !shouldScheduleAutosave({
        dirty,
        entryId: entry.id,
        publicationStatus: entry.status,
        persistenceStatus,
        paused: autosavePaused || busy,
      })
    ) {
      return;
    }
    const timer = scheduleAutosaveTimer(
      lastEditAt.current,
      Date.now(),
      () => void saveRef.current("autosave"),
      (callback, delay) => window.setTimeout(callback, delay)
    );
    return () => window.clearTimeout(timer);
  }, [
    autosavePaused,
    busy,
    dirty,
    editSequence,
    entry.id,
    entry.status,
    mode,
    persistenceStatus,
  ]);

  useEffect(() => {
    if (mode !== "authorized") return;
    function handleKeyDown(event: KeyboardEvent) {
      if (!isSaveShortcut(event)) return;
      event.preventDefault();
      if (!shouldRunSaveShortcut(event, busy)) return;
      void saveRef.current("manual");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, mode]);

  useEffect(() => {
    if (mode !== "authorized") return;
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (
        !shouldWarnBeforeUnload(
          hasPendingEditorChanges(dirty, scheduleDirty)
        )
      ) {
        return;
      }
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty, mode, scheduleDirty]);

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
          <p className="admin-meta">Markdown entry administration</p>
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
                  <span>{item.section} · {item.kind} · {item.status}</span>
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
            <label>Section<select value={entry.section} onChange={(event) => changeEntry({ section: event.target.value as EditorEntry["section"] })}><option value="writing">Writing</option><option value="music">Music</option></select></label>
            <label>Publication state<input value={entry.status} readOnly /></label>
          </div>
          <label>Tags<input value={tagsInput} onChange={(event) => { setTagsInput(event.target.value); markDirty(); }} placeholder="TypeScript, music" /></label>
          <label>Summary<textarea rows={3} value={entry.summary} onChange={(event) => changeEntry({ summary: event.target.value })} /></label>
          <MarkdownEditor
            documentKey={String(documentGeneration)}
            value={entry.bodyMarkdown}
            onChange={(bodyMarkdown) =>
              setEntry((current) => ({ ...current, bodyMarkdown }))
            }
            onDirty={markDirty}
            snapshotRef={bodyMarkdownSnapshot}
          />

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
            <button type="button" onClick={() => void save("manual")} disabled={busy || persistenceStatus === "saving" || !entry.slug || !entry.title}>Save</button>
            <button type="button" onClick={() => runAction("publish")} disabled={busy || !entry.id}>Publish now</button>
            <label>Schedule time<input type="datetime-local" value={scheduledAt} onChange={(event) => changeScheduledAt(event.target.value)} /></label>
            <button type="button" onClick={() => runAction("schedule")} disabled={busy || !entry.id || !scheduledAt}>Schedule</button>
            <button type="button" onClick={() => runAction("unpublish")} disabled={busy || !entry.id}>Unpublish</button>
            <button type="button" onClick={() => runAction("archive")} disabled={busy || !entry.id}>Archive</button>
            <button type="button" onClick={() => runAction("duplicate")} disabled={busy || !entry.id}>Duplicate</button>
            <button type="button" onClick={remove} disabled={busy || !entry.id || !deleteAllowed}>Delete</button>
          </div>
          <div className="admin-persistence" role="status">
            <span>{persistenceLabel(persistenceStatus, lastSavedAt)}</span>
            {persistenceStatus === "conflict" && (
              <button type="button" onClick={() => void reloadServerVersion()} disabled={busy}>
                Reload server version
              </button>
            )}
          </div>
          <p className="admin-meta">Version {entry.version || "new"}{entry.updatedAt ? ` · Updated ${new Date(entry.updatedAt).toLocaleString()}` : ""}{entry.publishedAt ? ` · Publishes ${new Date(entry.publishedAt).toLocaleString()}` : ""}</p>

          {entry.id && (
            <section className="admin-revisions" aria-label="Revision history">
              <h2>Revision history</h2>
              {revisions.length === 0 ? (
                <p className="admin-meta">No revisions loaded.</p>
              ) : (
                <ul>
                  {revisions.map((revision) => (
                    <li key={revision.revisionNumber}>
                      <span>
                        Revision {revision.revisionNumber} · {revision.status} ·{" "}
                        {new Date(revision.createdAt).toLocaleString()}
                      </span>
                      <div>
                        <button type="button" onClick={() => void previewRevision(revision.revisionNumber)} disabled={busy}>
                          Preview
                        </button>
                        <button type="button" onClick={() => void restoreRevision(revision.revisionNumber)} disabled={busy || dirty || scheduleDirty}>
                          Restore
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {revisionPreview && (
                <div className="admin-revision-preview">
                  <h3>Revision {revisionPreview.revisionNumber}</h3>
                  <p className="admin-meta">
                    {revisionPreview.section} · {revisionPreview.kind} ·{" "}
                    {revisionPreview.status} · {revisionPreview.slug}
                  </p>
                  <strong>{revisionPreview.title}</strong>
                  {revisionPreview.tags.length > 0 && (
                    <p className="admin-meta">{revisionPreview.tags.join(", ")}</p>
                  )}
                  {revisionPreview.summary && <p>{revisionPreview.summary}</p>}
                  <pre>{revisionPreview.bodyMarkdown}</pre>
                  {revisionPreview.performanceDetails && (
                    <div className="admin-revision-performance">
                      <strong>
                        {revisionPreview.performanceDetails.workTitle}
                      </strong>
                      <p className="admin-meta">
                        {revisionPreview.performanceDetails.composer}
                        {revisionPreview.performanceDetails.venue
                          ? ` · ${revisionPreview.performanceDetails.venue}`
                          : ""}
                        {revisionPreview.performanceDetails.performedAt
                          ? ` · ${new Date(
                              revisionPreview.performanceDetails.performedAt
                            ).toLocaleString()}`
                          : ""}
                      </p>
                      <p className="admin-meta">
                        {revisionPreview.performanceDetails.youtubeUrl}
                      </p>
                      {revisionPreview.performanceDetails.notesMarkdown && (
                        <pre>
                          {revisionPreview.performanceDetails.notesMarkdown}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
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
        .admin-markdown-editor { display: grid; gap: 0.5rem; }
        .admin-editor-modes { display: flex; gap: 0.4rem; }
        .admin-rich-editor { min-height: 22rem; border: 1px solid var(--hairline); border-radius: 4px; background: var(--bg); }
        .admin-rich-editor .milkdown { min-height: 22rem; }
        .admin-rich-editor .ProseMirror { min-height: 20rem; padding: 1rem; }
        .admin-youtube-node { border: 1px solid var(--hairline); border-radius: 4px; padding: 0.75rem; color: var(--muted); font: 0.8125rem var(--mono); }
        .admin-form fieldset { display: grid; gap: 0.75rem; padding: 0.85rem; border: 1px solid var(--hairline); border-radius: 4px; }
        .admin-form legend { padding-inline: 0.35rem; font: 0.75rem var(--mono); color: var(--muted); }
        .admin-actions { display: flex; flex-wrap: wrap; align-items: end; gap: 0.55rem; padding-top: 0.35rem; }
        .admin-actions label { min-width: 13rem; }
        .admin-persistence { display: flex; align-items: center; gap: 0.65rem; color: var(--muted); font: 0.75rem var(--mono); }
        .admin-revisions { display: grid; gap: 0.65rem; border-top: 1px solid var(--hairline); padding-top: 1rem; }
        .admin-revisions h2, .admin-revisions h3 { margin: 0; font-size: 1rem; }
        .admin-revisions ul { display: grid; gap: 0.45rem; list-style: none; }
        .admin-revisions li { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; font: 0.75rem var(--mono); }
        .admin-revisions li div { display: flex; gap: 0.4rem; }
        .admin-revision-preview { display: grid; gap: 0.5rem; padding: 0.75rem; border: 1px solid var(--hairline); border-radius: 4px; }
        .admin-revision-performance { display: grid; gap: 0.35rem; border-top: 1px solid var(--hairline); padding-top: 0.65rem; }
        .admin-revision-preview pre { max-height: 18rem; overflow: auto; white-space: pre-wrap; font: 0.75rem/1.5 var(--mono); }
        .admin-message { font: 0.8125rem var(--mono); color: var(--accent); }
        @media (max-width: 760px) { .admin-layout { grid-template-columns: 1fr; } .admin-list { border-right: 0; border-bottom: 1px solid var(--hairline); padding: 0 0 1rem; } .admin-grid { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );
}
