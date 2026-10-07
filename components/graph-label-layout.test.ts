import { describe, expect, it } from "vitest";
import { layoutGraphLabels } from "./graph-label-layout";

describe("graph label layout", () => {
  it("keeps labels inside a narrow map and preserves their full titles", () => {
    const nodes = [
      { id: "a", label: "Beethoven, Sonata Op. 10 No. 2", x: 6, y: 392, pinned: false },
      { id: "b", label: "Gradus ad Parnassum", x: 354, y: 6, pinned: true },
    ];
    const labels = layoutGraphLabels(nodes, 360, 400);
    for (const node of nodes) {
      const label = labels.get(node.id)!;
      expect(label.lines.join(" ")).toBe(node.label);
      expect(node.x + label.dx).toBeGreaterThanOrEqual(4);
      expect(node.x + label.dx + Math.max(...label.lines.map((line) => line.length)) * 8.4).toBeLessThanOrEqual(360);
      expect(node.y + label.dy).toBeGreaterThanOrEqual(12);
      expect(node.y + label.dy + (label.lines.length - 1) * 16).toBeLessThanOrEqual(400);
    }
    expect(layoutGraphLabels([...nodes].reverse(), 360, 400)).toEqual(labels);
  });

  it("places nearby labels on separate sides when they would overlap", () => {
    const nodes = [
      { id: "a", label: "First project", x: 150, y: 150, pinned: true },
      { id: "b", label: "Second project", x: 170, y: 150, pinned: false },
    ];
    const labels = layoutGraphLabels(nodes, 360, 400);
    expect(Math.abs(labels.get("a")!.dy - labels.get("b")!.dy)).toBeGreaterThanOrEqual(16);
  });
});
