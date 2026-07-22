import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import KnowledgeGraph from "./knowledge-graph";

describe("knowledge graph", () => {
  it("provides a keyboard-accessible control for every node", () => {
    const html = renderToStaticMarkup(
      <KnowledgeGraph
        data={{
          nodes: [
            {
              id: "project:reader",
              label: "Reader",
              type: "project",
              href: "/work#reader",
              deg: 1,
            },
            {
              id: "retrieval",
              label: "retrieval",
              type: "concept",
              href: null,
              deg: 1,
            },
          ],
          edges: [{ s: "project:reader", t: "retrieval", kind: "tag" }],
        }}
      />
    );

    expect(html).toContain("Browse graph nodes");
    expect(html).toContain('href="/work#reader"');
    expect(html).toContain('type="button"');
    expect(html).toContain("retrieval");
    expect(html).toContain("focus");
  });
});
