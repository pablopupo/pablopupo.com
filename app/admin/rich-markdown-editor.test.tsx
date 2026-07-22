import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

type MarkdownMatch = (node: unknown) => boolean;
type NodeSchemaFactory = () => {
  parseMarkdown: {
    match: MarkdownMatch;
  };
};

const schemaFactories = vi.hoisted(
  () => new Map<string, NodeSchemaFactory>()
);

vi.mock("@milkdown/crepe", () => ({
  Crepe: class Crepe {
    static Feature = {
      AI: "ai",
      ImageBlock: "image-block",
      Latex: "latex",
      Table: "table",
      TopBar: "top-bar",
    };
  },
}));

vi.mock("@milkdown/kit/plugin/upload", () => ({
  uploadConfig: { key: {} },
}));

vi.mock("@milkdown/kit/prose/state", () => ({
  Plugin: class Plugin {},
}));

vi.mock("@milkdown/kit/utils", () => ({
  $nodeSchema: (name: string, factory: NodeSchemaFactory) => {
    schemaFactories.set(name, factory);
    return {};
  },
  $prose: () => ({}),
  $remark: () => ({}),
  getMarkdown: () => "",
  replaceAll: () => undefined,
}));

vi.mock("@milkdown/react", () => ({
  Milkdown: () => null,
  MilkdownProvider: ({ children }: { children: ReactNode }) => children,
  useEditor: () => ({ get: () => null, loading: true }),
}));

import "./rich-markdown-editor";

describe("rich Markdown YouTube node", () => {
  const match = () => {
    const factory = schemaFactories.get("youtube");
    if (!factory) throw new Error("YouTube node schema was not registered");
    return factory().parseMarkdown.match;
  };

  it("matches only lossless YouTube leaf directives", () => {
    expect(
      match()({
        type: "leafDirective",
        name: "youtube",
        attributes: { id: "M7lc1UVf-VE" },
        children: [],
      })
    ).toBe(true);
    expect(
      match()({
        type: "leafDirective",
        name: "youtube",
        attributes: { id: "M7lc1UVf-VE" },
        children: [{ type: "text", value: "caption" }],
      })
    ).toBe(false);
  });
});
