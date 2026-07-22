export const AUTOSAVE_DELAY_MS = 1500;

export type PersistenceStatus =
  | "saved"
  | "unsaved"
  | "saving"
  | "conflict";

export type PersistenceState = {
  dirty: boolean;
  status: PersistenceStatus;
  paused: boolean;
};

export function dirtyPersistenceState(
  state: PersistenceState
): PersistenceState {
  if (state.status === "conflict") return state;
  return { dirty: true, status: "unsaved", paused: false };
}

export function successfulSaveState(
  changedDuringRequest: boolean
): PersistenceState {
  return changedDuringRequest
    ? { dirty: true, status: "unsaved", paused: false }
    : { dirty: false, status: "saved", paused: false };
}

export function failedSaveState(conflict: boolean): PersistenceState {
  return {
    dirty: true,
    status: conflict ? "conflict" : "unsaved",
    paused: true,
  };
}

export function canStartDocumentSave(
  activeDocumentEpochs: ReadonlySet<number>,
  documentEpoch: number
) {
  return !activeDocumentEpochs.has(documentEpoch);
}

export function canStartDocumentDelete(
  activeDocumentEpochs: ReadonlySet<number>,
  documentEpoch: number
) {
  return !activeDocumentEpochs.has(documentEpoch);
}

export function nextEditSequence(current: number) {
  return current + 1;
}

export function remainingAutosaveDelay(lastEditAt: number, now: number) {
  return Math.max(0, AUTOSAVE_DELAY_MS - (now - lastEditAt));
}

export function scheduleAutosaveTimer<T>(
  lastEditAt: number,
  now: number,
  save: () => void,
  schedule: (callback: () => void, delay: number) => T
) {
  return schedule(save, remainingAutosaveDelay(lastEditAt, now));
}

export function isScheduleInputDirty(value: string, baseline: string) {
  return value !== baseline;
}

export function deletedDocumentDisposition(input: {
  contentChanged: boolean;
  scheduleChanged: boolean;
}) {
  const retainAsDraft = input.contentChanged || input.scheduleChanged;
  return {
    retainAsDraft,
    dirty: retainAsDraft,
    preserveSchedule: input.scheduleChanged,
  };
}

export function revisionRestoreDisposition(input: {
  contentChanged: boolean;
  scheduleChanged: boolean;
}) {
  return {
    preserveLocalContent: input.contentChanged,
    preserveSchedule: input.scheduleChanged,
    dirty: input.contentChanged,
  };
}

export function shouldMarkDocumentTransaction(
  documentChanged: boolean,
  suppressed: boolean
) {
  return documentChanged && !suppressed;
}

type AutosaveState = {
  dirty: boolean;
  entryId: string | null;
  publicationStatus: "draft" | "scheduled" | "published" | "archived";
  persistenceStatus: PersistenceStatus;
  paused: boolean;
};

export function shouldScheduleAutosave(state: AutosaveState) {
  return (
    state.dirty &&
    Boolean(state.entryId) &&
    state.publicationStatus === "draft" &&
    state.persistenceStatus === "unsaved" &&
    !state.paused
  );
}

type SaveShortcut = {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
};

export function isSaveShortcut(event: SaveShortcut) {
  return (
    event.key.toLowerCase() === "s" && (event.metaKey || event.ctrlKey)
  );
}

export function shouldRunSaveShortcut(event: SaveShortcut, busy: boolean) {
  return isSaveShortcut(event) && !busy;
}

export function hasPendingEditorChanges(
  contentDirty: boolean,
  scheduleDirty: boolean
) {
  return contentDirty || scheduleDirty;
}

export function shouldWarnBeforeUnload(dirty: boolean) {
  return dirty;
}

type SavedIdentity = {
  id: string | null;
  version: number;
  updatedAt: string | null;
};

export function reconcileSavedEntry<T extends SavedIdentity>(
  local: T,
  saved: T,
  changedDuringRequest: boolean
) {
  if (!changedDuringRequest) return saved;
  return {
    ...local,
    id: saved.id,
    version: saved.version,
    updatedAt: saved.updatedAt,
  };
}

type PublishedIdentity = SavedIdentity & {
  status: string;
  publishedAt: string | null;
};

export function reconcilePublishedEntry<
  TLocal extends PublishedIdentity,
  TSaved extends PublishedIdentity,
>(
  local: TLocal,
  saved: TSaved,
  changedDuringRequest: boolean
) {
  if (!changedDuringRequest) return saved;
  return {
    ...local,
    id: saved.id,
    version: saved.version,
    updatedAt: saved.updatedAt,
    status: saved.status,
    publishedAt: saved.publishedAt,
  };
}

export function persistenceLabel(
  status: PersistenceStatus,
  lastSavedAt: Date | null
) {
  if (status === "saving") return "Saving";
  if (status === "conflict") return "Conflict";
  if (status === "unsaved") return "Unsaved";
  return lastSavedAt ? `Saved ${lastSavedAt.toLocaleTimeString()}` : "Saved";
}
