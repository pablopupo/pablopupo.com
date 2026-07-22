import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTOSAVE_DELAY_MS,
  canStartDocumentDelete,
  canStartDocumentSave,
  deletedDocumentDisposition,
  dirtyPersistenceState,
  failedSaveState,
  hasPendingEditorChanges,
  isScheduleInputDirty,
  isSaveShortcut,
  nextEditSequence,
  remainingAutosaveDelay,
  reconcilePublishedEntry,
  reconcileSavedEntry,
  revisionRestoreDisposition,
  scheduleAutosaveTimer,
  successfulSaveState,
  shouldMarkDocumentTransaction,
  shouldRunSaveShortcut,
  shouldScheduleAutosave,
  shouldWarnBeforeUnload,
} from "./editor-persistence";

afterEach(() => {
  vi.useRealTimers();
});

describe("editor persistence", () => {
  it("schedules autosave only for existing dirty drafts after 1500ms", () => {
    expect(AUTOSAVE_DELAY_MS).toBe(1500);
    expect(
      shouldScheduleAutosave({
        dirty: true,
        entryId: "entry-1",
        publicationStatus: "draft",
        persistenceStatus: "unsaved",
        paused: false,
      })
    ).toBe(true);
    for (const changes of [
      { dirty: false },
      { entryId: null },
      { publicationStatus: "published" as const },
      { publicationStatus: "scheduled" as const },
      { publicationStatus: "archived" as const },
      { persistenceStatus: "saving" as const },
      { persistenceStatus: "conflict" as const },
      { paused: true },
    ]) {
      expect(
        shouldScheduleAutosave({
          dirty: true,
          entryId: "entry-1",
          publicationStatus: "draft",
          persistenceStatus: "unsaved",
          paused: false,
          ...changes,
        })
      ).toBe(false);
    }
  });

  it("keeps newer local edits while adopting the successful save version", () => {
    const local = {
      id: "entry-1",
      title: "Typed while saving",
      bodyMarkdown: "Newer local body",
      version: 1,
      updatedAt: "old",
    };
    const saved = {
      id: "entry-1",
      title: "Submitted snapshot",
      bodyMarkdown: "Saved body",
      version: 2,
      updatedAt: "new",
    };

    expect(reconcileSavedEntry(local, saved, true)).toEqual({
      ...local,
      version: 2,
      updatedAt: "new",
    });
    expect(reconcileSavedEntry(local, saved, false)).toEqual(saved);
  });

  it("keeps pending edits while adopting a restored publication state", () => {
    const local = {
      id: "entry-1",
      title: "Typed while restoring",
      version: 3,
      updatedAt: "old",
      status: "draft" as const,
      publishedAt: null,
    };
    const restored = {
      id: "entry-1",
      title: "Restored snapshot",
      version: 4,
      updatedAt: "new",
      status: "published" as const,
      publishedAt: "2026-07-22T12:00:00.000Z",
    };

    expect(reconcilePublishedEntry(local, restored, true)).toEqual({
      ...local,
      version: 4,
      updatedAt: "new",
      status: "published",
      publishedAt: "2026-07-22T12:00:00.000Z",
    });
    expect(reconcilePublishedEntry(local, restored, false)).toEqual(restored);
  });

  it("remains dirty when an edit lands while a save response is pending", () => {
    expect(
      dirtyPersistenceState({
        dirty: true,
        status: "saving",
        paused: false,
      })
    ).toEqual({ dirty: true, status: "unsaved", paused: false });
    expect(successfulSaveState(true)).toEqual({
      dirty: true,
      status: "unsaved",
      paused: false,
    });
    expect(successfulSaveState(false)).toEqual({
      dirty: false,
      status: "saved",
      paused: false,
    });
  });

  it("stops autosave after conflicts or request failures", () => {
    expect(failedSaveState(true)).toEqual({
      dirty: true,
      status: "conflict",
      paused: true,
    });
    expect(failedSaveState(false)).toEqual({
      dirty: true,
      status: "unsaved",
      paused: true,
    });
    expect(
      dirtyPersistenceState({
        dirty: true,
        status: "conflict",
        paused: true,
      })
    ).toEqual({ dirty: true, status: "conflict", paused: true });
  });

  it("recognizes Cmd/Ctrl+S and protects dirty navigation", () => {
    expect(isSaveShortcut({ key: "s", metaKey: true, ctrlKey: false })).toBe(true);
    expect(isSaveShortcut({ key: "S", metaKey: false, ctrlKey: true })).toBe(true);
    expect(isSaveShortcut({ key: "s", metaKey: false, ctrlKey: false })).toBe(false);
    expect(isSaveShortcut({ key: "x", metaKey: true, ctrlKey: false })).toBe(false);
    expect(
      shouldRunSaveShortcut(
        { key: "s", metaKey: true, ctrlKey: false },
        false
      )
    ).toBe(true);
    expect(
      shouldRunSaveShortcut(
        { key: "s", metaKey: true, ctrlKey: false },
        true
      )
    ).toBe(false);
    expect(shouldWarnBeforeUnload(true)).toBe(true);
    expect(shouldWarnBeforeUnload(false)).toBe(false);
    expect(hasPendingEditorChanges(false, true)).toBe(true);
    expect(hasPendingEditorChanges(false, false)).toBe(false);
  });

  it("marks every document transaction except controlled replacements", () => {
    expect(shouldMarkDocumentTransaction(true, false)).toBe(true);
    expect(shouldMarkDocumentTransaction(false, false)).toBe(false);
    expect(shouldMarkDocumentTransaction(true, true)).toBe(false);
  });

  it("scopes active save locks to one document and advances every edit debounce", () => {
    const activeEpochs = new Set([3]);

    expect(canStartDocumentSave(activeEpochs, 3)).toBe(false);
    expect(canStartDocumentSave(activeEpochs, 4)).toBe(true);
    expect(canStartDocumentDelete(activeEpochs, 3)).toBe(false);
    expect(canStartDocumentDelete(activeEpochs, 4)).toBe(true);
    expect(nextEditSequence(8)).toBe(9);
    expect(remainingAutosaveDelay(1_000, 1_400)).toBe(1_100);
    expect(remainingAutosaveDelay(1_000, 3_000)).toBe(0);
  });

  it("fires autosave from the last edit deadline without response-based drift", () => {
    vi.useFakeTimers();
    const save = vi.fn();

    scheduleAutosaveTimer(1_000, 1_400, save, (callback, delay) =>
      setTimeout(callback, delay)
    );

    vi.advanceTimersByTime(1_099);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledOnce();
  });

  it("clears pending schedule state when input returns to its baseline", () => {
    const baseline = "2026-08-01T08:00";

    expect(isScheduleInputDirty(baseline, baseline)).toBe(false);
    expect(isScheduleInputDirty("2026-08-02T08:00", baseline)).toBe(true);
    expect(isScheduleInputDirty("", baseline)).toBe(true);
    expect(isScheduleInputDirty(baseline, baseline)).toBe(false);
  });

  it("retains edits made while a confirmed deletion is pending", () => {
    expect(
      deletedDocumentDisposition({
        contentChanged: true,
        scheduleChanged: false,
      })
    ).toEqual({ retainAsDraft: true, dirty: true, preserveSchedule: false });
    expect(
      deletedDocumentDisposition({
        contentChanged: false,
        scheduleChanged: true,
      })
    ).toEqual({ retainAsDraft: true, dirty: true, preserveSchedule: true });
    expect(
      deletedDocumentDisposition({
        contentChanged: false,
        scheduleChanged: false,
      })
    ).toEqual({ retainAsDraft: false, dirty: false, preserveSchedule: false });
  });

  it("separates schedule-only changes from restored content", () => {
    expect(
      revisionRestoreDisposition({
        contentChanged: false,
        scheduleChanged: true,
      })
    ).toEqual({
      preserveLocalContent: false,
      preserveSchedule: true,
      dirty: false,
    });
    expect(
      revisionRestoreDisposition({
        contentChanged: true,
        scheduleChanged: false,
      })
    ).toEqual({
      preserveLocalContent: true,
      preserveSchedule: false,
      dirty: true,
    });
  });
});
