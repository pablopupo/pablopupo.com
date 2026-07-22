"use client";

import { Crepe } from "@milkdown/crepe";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/classic.css";
import { editorViewOptionsCtx } from "@milkdown/kit/core";
import { uploadConfig } from "@milkdown/kit/plugin/upload";
import { Plugin } from "@milkdown/kit/prose/state";
import type { EditorProps } from "@milkdown/kit/prose/view";
import {
  $nodeSchema,
  $prose,
  $remark,
  getMarkdown,
  replaceAll,
} from "@milkdown/kit/utils";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useEffect, useRef, type MutableRefObject } from "react";
import remarkDirective from "remark-directive";
import { shouldMarkDocumentTransaction } from "./editor-persistence";
import {
  restoreAuthoringSyntax,
  shouldPublishMarkdownUpdate,
  youtubeVideoIdPattern,
} from "@/lib/markdown/youtube";

type YoutubeMarkdownNode = {
  type: string;
  name?: string;
  attributes?: Record<string, string | null> | null;
  children?: unknown[];
};

const youtubeDirectiveRemark = $remark(
  "youtube-directive",
  () => remarkDirective
);

const youtubeDirectiveNode = $nodeSchema("youtube", () => ({
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,
  attrs: {
    id: { default: "" },
    title: { default: null },
  },
  parseDOM: [
    {
      tag: 'div[data-type="youtube"]',
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false;
        return {
          id: dom.dataset.youtubeId ?? "",
          title: dom.dataset.youtubeTitle ?? null,
        };
      },
    },
  ],
  toDOM: (node) => [
    "div",
    {
      "data-type": "youtube",
      "data-youtube-id": node.attrs.id,
      "data-youtube-title": node.attrs.title ?? "",
      class: "admin-youtube-node",
    },
    node.attrs.title || `YouTube video ${node.attrs.id}`,
  ],
  parseMarkdown: {
    match: (node) => {
      const directive = node as YoutubeMarkdownNode;
      return (
        directive.type === "leafDirective" &&
        directive.name === "youtube" &&
        (directive.children?.length ?? 0) === 0 &&
        typeof directive.attributes?.id === "string" &&
        youtubeVideoIdPattern.test(directive.attributes.id)
      );
    },
    runner: (state, node, type) => {
      const directive = node as YoutubeMarkdownNode;
      state.addNode(type, {
        id: directive.attributes?.id,
        title: directive.attributes?.title ?? null,
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "youtube",
    runner: (state, node) => {
      const attributes: Record<string, string> = { id: node.attrs.id };
      if (node.attrs.title) attributes.title = node.attrs.title;
      state.addNode("leafDirective", [], undefined, {
        name: "youtube",
        attributes,
      });
    },
  },
}));

export type RichMarkdownEditorProps = {
  defaultValue: string;
  syncedValue: string;
  syncRevision: number;
  onChange: (markdown: string) => void;
  onDirty: () => void;
  snapshotRef: MutableRefObject<((submitted?: boolean) => string) | null>;
};

export function richEditorFeatures() {
  return {
    [Crepe.Feature.AI]: false,
    [Crepe.Feature.ImageBlock]: false,
    [Crepe.Feature.Latex]: false,
    [Crepe.Feature.Table]: false,
    [Crepe.Feature.TopBar]: false,
  };
}

export function accessibleEditorViewOptions(options: Partial<EditorProps>) {
  const accessibleAttributes = {
    "aria-label": "Markdown content",
    "aria-multiline": "true",
  };
  const attributes = options.attributes;
  if (typeof attributes === "function") {
    return {
      ...options,
      attributes: (state: Parameters<typeof attributes>[0]) => ({
        ...attributes(state),
        ...accessibleAttributes,
      }),
    };
  }
  return {
    ...options,
    attributes: { ...attributes, ...accessibleAttributes },
  };
}

function RichEditor({
  defaultValue,
  syncedValue,
  syncRevision,
  onChange,
  onDirty,
  snapshotRef,
}: RichMarkdownEditorProps) {
  const initialValue = useRef(defaultValue).current;
  const latestMarkdown = useRef(initialValue);
  const onChangeRef = useRef(onChange);
  const onDirtyRef = useRef(onDirty);
  const suppressDirtyTransaction = useRef(false);
  const dirtyTransactionPlugin = useRef(
    $prose(
      () =>
        new Plugin({
          state: {
            init: () => null,
            apply: (transaction, state) => {
              if (
                shouldMarkDocumentTransaction(
                  transaction.docChanged,
                  suppressDirtyTransaction.current
                )
              ) {
                onDirtyRef.current();
              }
              return state;
            },
          },
        })
    )
  ).current;
  onChangeRef.current = onChange;
  onDirtyRef.current = onDirty;

  const { get, loading } = useEditor(
    (root) => {
      const crepe = new Crepe({
        root,
        defaultValue: initialValue,
        features: richEditorFeatures(),
      });
      crepe.editor
        .use(youtubeDirectiveRemark)
        .use(youtubeDirectiveNode)
        .use(dirtyTransactionPlugin)
        .config((ctx) => {
          ctx.update(editorViewOptionsCtx, accessibleEditorViewOptions);
          ctx.update(uploadConfig.key, (configuration) => ({
            ...configuration,
            uploader: async () => [],
          }));
        });
      crepe.on((listener) => {
        listener.markdownUpdated((_context, markdown) => {
          const serialized = restoreAuthoringSyntax(markdown);
          if (!shouldPublishMarkdownUpdate(serialized, latestMarkdown.current)) {
            return;
          }
          latestMarkdown.current = serialized;
          onChangeRef.current(serialized);
        });
      });
      return crepe;
    },
    []
  );

  useEffect(() => {
    if (loading) return;
    const editor = get();
    if (!editor) return;
    const snapshot = () =>
      restoreAuthoringSyntax(editor.action(getMarkdown()));
    snapshotRef.current = snapshot;
    return () => {
      if (snapshotRef.current === snapshot) snapshotRef.current = null;
    };
  }, [get, loading, snapshotRef]);

  useEffect(() => {
    if (loading || syncRevision === 0) return;
    const editor = get();
    if (!editor || syncedValue === latestMarkdown.current) return;
    latestMarkdown.current = syncedValue;
    suppressDirtyTransaction.current = true;
    try {
      editor.action(replaceAll(syncedValue));
    } finally {
      suppressDirtyTransaction.current = false;
    }
  }, [get, loading, syncRevision, syncedValue]);

  return (
    <div className="admin-rich-editor">
      {loading && <p role="status">Starting rich editor…</p>}
      <Milkdown />
    </div>
  );
}

export default function RichMarkdownEditor(props: RichMarkdownEditorProps) {
  return (
    <MilkdownProvider>
      <RichEditor {...props} />
    </MilkdownProvider>
  );
}
