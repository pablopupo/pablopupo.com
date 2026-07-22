"use client";

import dynamic from "next/dynamic";
import { useRef, useState, type MutableRefObject } from "react";
import type { RichMarkdownEditorProps } from "./rich-markdown-editor";

export type MarkdownMode = "rich" | "raw";
export type MarkdownSnapshot = (submitted?: boolean) => string;

const RichMarkdownEditor = dynamic<RichMarkdownEditorProps>(
  () => import("./rich-markdown-editor"),
  {
    loading: () => <p role="status">Loading rich editor…</p>,
    ssr: false,
  }
);

export function nextMarkdownMode(mode: MarkdownMode): MarkdownMode {
  return mode === "rich" ? "raw" : "rich";
}

export function shouldSyncRichEditor(
  previous: MarkdownMode,
  next: MarkdownMode
) {
  return previous === "raw" && next === "rich";
}

export function selectMarkdownSnapshot(
  mode: MarkdownMode,
  value: string,
  richSnapshot: MarkdownSnapshot | null,
  submitted = true
) {
  return mode === "rich" && richSnapshot ? richSnapshot(submitted) : value;
}

type MarkdownEditorProps = {
  documentKey: string;
  value: string;
  onChange: (markdown: string) => void;
  onDirty: () => void;
  snapshotRef: MutableRefObject<MarkdownSnapshot>;
};

export default function MarkdownEditor({
  documentKey,
  value,
  onChange,
  onDirty,
  snapshotRef,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<MarkdownMode>("rich");
  const [syncRevision, setSyncRevision] = useState(0);
  const richSnapshotRef = useRef<MarkdownSnapshot | null>(null);
  const modeRef = useRef(mode);
  const valueRef = useRef(value);
  modeRef.current = mode;
  valueRef.current = value;
  snapshotRef.current = (submitted = true) =>
    selectMarkdownSnapshot(
      modeRef.current,
      valueRef.current,
      richSnapshotRef.current,
      submitted
    );

  function selectMode(next: MarkdownMode) {
    if (shouldSyncRichEditor(mode, next)) {
      setSyncRevision((revision) => revision + 1);
    }
    setMode(next);
  }

  return (
    <div className="admin-markdown-editor">
      <div className="admin-editor-modes" role="group" aria-label="Markdown mode">
        <button
          type="button"
          aria-pressed={mode === "rich"}
          onClick={() => selectMode("rich")}
        >
          Rich Markdown
        </button>
        <button
          type="button"
          aria-pressed={mode === "raw"}
          onClick={() => selectMode("raw")}
        >
          Raw Markdown
        </button>
      </div>
      <div hidden={mode !== "rich"}>
        <RichMarkdownEditor
          key={documentKey}
          defaultValue={value}
          syncRevision={syncRevision}
          syncedValue={value}
          onChange={onChange}
          onDirty={onDirty}
          snapshotRef={richSnapshotRef}
        />
      </div>
      {mode === "raw" && (
        <label>
          Markdown
          <textarea
            className="admin-markdown"
            rows={20}
            spellCheck={false}
            value={value}
            onChange={(event) => {
              onDirty();
              onChange(event.target.value);
            }}
          />
        </label>
      )}
    </div>
  );
}
