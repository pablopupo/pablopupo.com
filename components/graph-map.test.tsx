// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import GraphMap, {
  directionalGraphNode,
  layoutGraph,
  reduceGraphDrag,
  resolveGraphFocus,
  type GraphMapData,
} from "./graph-map";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = null;
  container = null;
});

function mountGraphMap(
  graphData: GraphMapData,
  options: {
    selectedId?: string | null;
    connectingFromId?: string | null;
    onSelect?: (id: string) => void;
  } = {}
) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <GraphMap
        data={graphData}
        selectedId={options.selectedId ?? null}
        connectingFromId={options.connectingFromId}
        onSelect={options.onSelect ?? vi.fn()}
        ariaLabel="Editable knowledge map"
      />
    );
  });
  return container;
}

function graphNode(element: ParentNode, id: string) {
  const node = element.querySelector<SVGGElement>(`[data-graph-node="${id}"]`);
  if (!node) throw new Error(`Missing graph node ${id}`);
  return node;
}

function pointer(
  element: EventTarget,
  type:
    | "pointerdown"
    | "pointermove"
    | "pointerup"
    | "pointercancel"
    | "lostpointercapture",
  init: {
    pointerId: number;
    clientX: number;
    clientY: number;
    button?: number;
    buttons?: number;
  }
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: init.button ?? 0,
    buttons:
      init.buttons ??
      (type === "pointerdown" || type === "pointermove" ? 1 : 0),
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  element.dispatchEvent(event);
}

function lineEndpoints(element: ParentNode) {
  return [...element.querySelectorAll(".graph-map-edge")].map((line) => [
    line.getAttribute("x1"),
    line.getAttribute("y1"),
    line.getAttribute("x2"),
    line.getAttribute("y2"),
  ]);
}

const data: GraphMapData = {
  nodes: [
    {
      id: "applied-ai",
      label: "Applied AI",
      type: "concept",
      summary: "Useful AI systems.",
      href: null,
      pinned: true,
    },
    {
      id: "music",
      label: "Music",
      type: "concept",
      summary: "Classical piano.",
      href: null,
      pinned: true,
    },
    {
      id: "gradus",
      label: "Gradus",
      type: "project",
      summary: "Retrieval over musical notation.",
      href: "/work#gradus",
      pinned: false,
    },
  ],
  edges: [
    { id: "ai-gradus", s: "applied-ai", t: "gradus", kind: "semantic" },
    { id: "music-gradus", s: "music", t: "gradus", kind: "semantic" },
  ],
};

const codeUnitData: GraphMapData = {
  nodes: [
    {
      id: "node:ä",
      label: "Same",
      type: "concept",
      summary: null,
      href: null,
      pinned: false,
    },
    {
      id: "node:z",
      label: "Äther",
      type: "project",
      summary: null,
      href: null,
      pinned: false,
    },
    {
      id: "node:a",
      label: "Same",
      type: "writing",
      summary: null,
      href: null,
      pinned: false,
    },
  ],
  edges: [
    { id: "edge:ä", s: "node:z", t: "node:ä", kind: "semantic" },
    { id: "edge:a", s: "node:a", t: "node:z", kind: "tag" },
  ],
};

const connectedLayoutData: GraphMapData = {
  nodes: [
    ["applied-ai", "Applied AI", "concept", true],
    ["music", "Music", "concept", true],
    ["gradus", "Gradus", "project", false],
    ["reader", "Reader", "project", false],
    ["kit-ai", "Kit AI", "project", false],
    ["accordo", "Accordo", "project", false],
    ["chopin", "Chopin Etudes", "music", false],
    ["notation", "Notation", "concept", false],
    ["retrieval", "Retrieval", "concept", false],
    ["inference", "Inference", "concept", false],
    ["documents", "Document intelligence", "concept", false],
    ["rag-note", "Grounded retrieval", "writing", false],
    ["score-note", "Reading scores", "writing", false],
    ["bach-judge", "Bach judge", "project", false],
    ["mcp", "MCP", "concept", false],
  ].map(([id, label, type, pinned]) => ({
    id: id as string,
    label: label as string,
    type: type as GraphMapData["nodes"][number]["type"],
    summary: null,
    href: null,
    pinned: pinned as boolean,
  })),
  edges: [
    { id: "ai-reader", s: "applied-ai", t: "reader", kind: "tag" },
    { id: "ai-kit", s: "applied-ai", t: "kit-ai", kind: "tag" },
    { id: "ai-retrieval", s: "applied-ai", t: "retrieval", kind: "tag" },
    { id: "ai-inference", s: "applied-ai", t: "inference", kind: "tag" },
    { id: "ai-documents", s: "applied-ai", t: "documents", kind: "tag" },
    { id: "reader-documents", s: "reader", t: "documents", kind: "tag" },
    { id: "reader-mcp", s: "reader", t: "mcp", kind: "link" },
    { id: "kit-inference", s: "kit-ai", t: "inference", kind: "tag" },
    { id: "retrieval-rag", s: "retrieval", t: "rag-note", kind: "link" },
    { id: "music-gradus", s: "music", t: "gradus", kind: "tag" },
    { id: "music-accordo", s: "music", t: "accordo", kind: "tag" },
    { id: "music-chopin", s: "music", t: "chopin", kind: "tag" },
    { id: "music-bach", s: "music", t: "bach-judge", kind: "tag" },
    { id: "gradus-notation", s: "gradus", t: "notation", kind: "tag" },
    { id: "gradus-score", s: "gradus", t: "score-note", kind: "link" },
    {
      id: "gradus-retrieval",
      s: "gradus",
      t: "retrieval",
      kind: "semantic",
    },
    { id: "chopin-notation", s: "chopin", t: "notation", kind: "tag" },
  ],
};

describe("graph map layout", () => {
  it("moves identity nodes when their topology changes", () => {
    const bridge = new Map(layoutGraph(data).map((node) => [node.id, node]));
    const directIdentityLink = {
      ...data,
      edges: [
        { id: "ai-music", s: "applied-ai", t: "music", kind: "semantic" as const },
      ],
    };
    const direct = new Map(
      layoutGraph(directIdentityLink).map((node) => [node.id, node])
    );

    expect(direct.get("applied-ai")).not.toEqual(bridge.get("applied-ai"));
    expect(direct.get("music")).not.toEqual(bridge.get("music"));
  });

  it("changes placement when a node becomes connected", () => {
    const disconnected = layoutGraph({ ...data, edges: [] });
    const linked = layoutGraph({
      ...data,
      edges: [
        { id: "ai-music", s: "applied-ai", t: "music", kind: "semantic" },
      ],
    });
    expect(linked.find((node) => node.id === "music")).not.toEqual(
      disconnected.find((node) => node.id === "music")
    );
  });

  it("is deterministic when database row order changes", () => {
    const reversed = {
      nodes: [...data.nodes].reverse(),
      edges: [...data.edges].reverse(),
    };

    expect(layoutGraph(reversed)).toEqual(layoutGraph(data));
  });

  it("keeps accented and equal-label layouts deterministic under shuffled rows", () => {
    const shuffled = {
      nodes: [
        codeUnitData.nodes[1],
        codeUnitData.nodes[2],
        codeUnitData.nodes[0],
      ],
      edges: [...codeUnitData.edges].reverse(),
    };

    expect(layoutGraph(shuffled)).toEqual(layoutGraph(codeUnitData));
    expect(layoutGraph(shuffled).map((node) => node.id)).toEqual([
      "node:a",
      "node:z",
      "node:ä",
    ]);
  });

  it("uses the canvas for a connected public-sized topology", () => {
    const nodes = layoutGraph(connectedLayoutData);
    const xs = nodes.map((node) => node.x);
    const ys = nodes.map((node) => node.y);

    const xSpan = Math.max(...xs) - Math.min(...xs);
    const ySpan = Math.max(...ys) - Math.min(...ys);

    const span = `${xSpan.toFixed(2)}px by ${ySpan.toFixed(2)}px`;
    expect.soft(xSpan, span).toBeGreaterThanOrEqual(390);
    expect.soft(xSpan, span).toBeLessThanOrEqual(420);
    expect.soft(ySpan, span).toBeGreaterThanOrEqual(210);
    expect.soft(ySpan, span).toBeLessThanOrEqual(240);
  });

  it("finds the nearest node in a requested keyboard direction", () => {
    const nodes = [
      { ...data.nodes[0], x: 100, y: 100 },
      { ...data.nodes[1], x: 300, y: 100 },
      { ...data.nodes[2], x: 200, y: 100 },
    ];
    expect(
      directionalGraphNode(nodes, "applied-ai", "right")
    ).toBe("gradus");
    expect(directionalGraphNode(nodes, "music", "left")).toBe("gradus");
  });
});

describe("graph map dragging", () => {
  it("uses client pixels for the threshold and graph coordinates for movement", () => {
    const started = reduceGraphDrag(null, {
      type: "start",
      id: "gradus",
      clientX: 100,
      clientY: 100,
      graphX: 50,
      graphY: 50,
      originX: 200,
      originY: 100,
    });
    const belowThreshold = reduceGraphDrag(started, {
      type: "move",
      clientX: 102.9,
      clientY: 100,
      graphX: 80,
      graphY: 50,
    });
    const moved = reduceGraphDrag(started, {
      type: "move",
      clientX: 103,
      clientY: 100,
      graphX: 56,
      graphY: 54,
    });

    expect(belowThreshold.drag).toMatchObject({ dragging: false, x: 200, y: 100 });
    expect(belowThreshold.effect).toBeNull();
    expect(moved.effect).toEqual({ id: "gradus", x: 206, y: 104, fixed: true });
  });

  it("releases fixed coordinates and clears suppression on cancellation", () => {
    const started = reduceGraphDrag(null, {
      type: "start",
      id: "gradus",
      clientX: 0,
      clientY: 0,
      graphX: 0,
      graphY: 0,
      originX: 200,
      originY: 100,
    });
    const dragged = reduceGraphDrag(started, {
      type: "move",
      clientX: 3,
      clientY: 0,
      graphX: 5,
      graphY: 0,
    });

    expect(reduceGraphDrag(dragged, { type: "release" })).toMatchObject({
      drag: null,
      suppressClick: true,
      effect: { id: "gradus", x: 205, y: 100, fixed: false },
    });
    expect(reduceGraphDrag(dragged, { type: "cancel" })).toMatchObject({
      drag: null,
      suppressClick: false,
      effect: { id: "gradus", x: 205, y: 100, fixed: false },
    });
  });
});

describe("mounted graph map interactions", () => {
  it("selects a click but suppresses selection after a three-client-pixel drag", () => {
    const onSelect = vi.fn();
    const mounted = mountGraphMap(data, { onSelect });
    const node = graphNode(mounted, "gradus");
    const captured = new Set<number>();
    const setPointerCapture = vi.fn((pointerId: number) => captured.add(pointerId));
    const releasePointerCapture = vi.fn((pointerId: number) =>
      captured.delete(pointerId)
    );
    Object.assign(node, {
      setPointerCapture,
      hasPointerCapture: (pointerId: number) => captured.has(pointerId),
      releasePointerCapture,
    });

    act(() => {
      pointer(node, "pointerdown", {
        pointerId: 7,
        clientX: 100,
        clientY: 100,
      });
      pointer(node, "pointerup", {
        pointerId: 7,
        clientX: 100,
        clientY: 100,
      });
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onSelect).toHaveBeenCalledWith("gradus");

    onSelect.mockClear();
    const originalLines = lineEndpoints(mounted);

    act(() => {
      pointer(node, "pointerdown", {
        pointerId: 8,
        clientX: 100,
        clientY: 100,
      });
      pointer(node, "pointermove", {
        pointerId: 8,
        clientX: 102.9,
        clientY: 100,
      });
    });
    expect(lineEndpoints(mounted)).toEqual(originalLines);

    act(() => {
      pointer(node, "pointermove", {
        pointerId: 8,
        clientX: 103,
        clientY: 100,
      });
    });
    expect(lineEndpoints(mounted)).not.toEqual(originalLines);

    act(() => {
      pointer(node, "pointerup", {
        pointerId: 8,
        clientX: 103,
        clientY: 100,
      });
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(setPointerCapture).toHaveBeenCalledWith(8);
    expect(releasePointerCapture).toHaveBeenCalledWith(8);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("releases a dragged node back to the simulation and clears suppression on cancel", async () => {
    const onSelect = vi.fn();
    const mounted = mountGraphMap(data, { onSelect });
    const node = graphNode(mounted, "gradus");
    const captured = new Set<number>();
    Object.assign(node, {
      setPointerCapture: (pointerId: number) => captured.add(pointerId),
      hasPointerCapture: (pointerId: number) => captured.has(pointerId),
      releasePointerCapture: (pointerId: number) => captured.delete(pointerId),
    });

    act(() => {
      pointer(node, "pointerdown", {
        pointerId: 12,
        clientX: 40,
        clientY: 40,
      });
      pointer(node, "pointermove", {
        pointerId: 12,
        clientX: 70,
        clientY: 40,
      });
    });
    const heldX = node
      .querySelector(".graph-node-hit")
      ?.getAttribute("cx");

    await act(async () => {
      pointer(node, "pointerup", {
        pointerId: 12,
        clientX: 70,
        clientY: 40,
      });
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
    const releasedX = node
      .querySelector(".graph-node-hit")
      ?.getAttribute("cx");
    expect(releasedX).not.toBe(heldX);

    act(() => {
      pointer(node, "pointerdown", {
        pointerId: 13,
        clientX: 50,
        clientY: 50,
      });
      pointer(node, "pointermove", {
        pointerId: 13,
        clientX: 60,
        clientY: 50,
      });
      pointer(node, "pointercancel", {
        pointerId: 13,
        clientX: 60,
        clientY: 50,
      });
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(captured.has(13)).toBe(false);
    expect(onSelect).toHaveBeenCalledWith("gradus");
  });

  it("stops dragging when pointer capture is lost before pointer release", () => {
    const onSelect = vi.fn();
    const mounted = mountGraphMap(data, { onSelect });
    const node = graphNode(mounted, "gradus");
    const captured = new Set<number>();
    Object.assign(node, {
      setPointerCapture: (pointerId: number) => captured.add(pointerId),
      hasPointerCapture: (pointerId: number) => captured.has(pointerId),
      releasePointerCapture: (pointerId: number) => captured.delete(pointerId),
    });
    const originalLines = lineEndpoints(mounted);

    act(() => {
      pointer(node, "pointerdown", {
        pointerId: 14,
        clientX: 40,
        clientY: 40,
      });
      pointer(node, "pointermove", {
        pointerId: 14,
        clientX: 70,
        clientY: 40,
      });
    });
    const draggedLines = lineEndpoints(mounted);

    act(() => {
      captured.delete(14);
      pointer(node, "lostpointercapture", {
        pointerId: 14,
        clientX: 70,
        clientY: 40,
        buttons: 0,
      });
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const releasedLines = lineEndpoints(mounted);
    expect(onSelect).toHaveBeenCalledWith("gradus");

    act(() => {
      pointer(node, "pointermove", {
        pointerId: 14,
        clientX: 140,
        clientY: 40,
        buttons: 0,
      });
    });

    expect(draggedLines).not.toEqual(originalLines);
    expect(lineEndpoints(mounted)).toEqual(releasedLines);
  });

  it("cancels a stale drag when the pointer returns with its button released", () => {
    const onSelect = vi.fn();
    const mounted = mountGraphMap(data, { onSelect });
    const node = graphNode(mounted, "gradus");
    const captured = new Set<number>();
    Object.assign(node, {
      setPointerCapture: (pointerId: number) => captured.add(pointerId),
      hasPointerCapture: (pointerId: number) => captured.has(pointerId),
      releasePointerCapture: (pointerId: number) => captured.delete(pointerId),
    });

    act(() => {
      pointer(node, "pointerdown", {
        pointerId: 15,
        clientX: 40,
        clientY: 40,
      });
      pointer(node, "pointermove", {
        pointerId: 15,
        clientX: 70,
        clientY: 40,
      });
    });
    const draggedLines = lineEndpoints(mounted);

    act(() => {
      pointer(node, "pointermove", {
        pointerId: 15,
        clientX: 140,
        clientY: 40,
        buttons: 0,
      });
    });

    expect(lineEndpoints(mounted)).toEqual(draggedLines);

    act(() => {
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith("gradus");
  });

  it.each(["pointerup", "pointercancel"] as const)(
    "ends an active drag when %s occurs outside the node",
    (pointerEndType) => {
      const onSelect = vi.fn();
      const mounted = mountGraphMap(data, { onSelect });
      const node = graphNode(mounted, "gradus");
      const captured = new Set<number>();
      Object.assign(node, {
        setPointerCapture: (pointerId: number) => captured.add(pointerId),
        hasPointerCapture: (pointerId: number) => captured.has(pointerId),
        releasePointerCapture: (pointerId: number) => captured.delete(pointerId),
      });

      act(() => {
        pointer(node, "pointerdown", {
          pointerId: 16,
          clientX: 40,
          clientY: 40,
        });
        pointer(node, "pointermove", {
          pointerId: 16,
          clientX: 70,
          clientY: 40,
        });
        pointer(window, pointerEndType, {
          pointerId: 16,
          clientX: 900,
          clientY: 40,
        });
      });

      expect(captured.has(16)).toBe(false);

      act(() => {
        node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
      expect(onSelect).toHaveBeenCalledWith("gradus");
    }
  );

  it("ends an active drag when the window loses focus", () => {
    const onSelect = vi.fn();
    const mounted = mountGraphMap(data, { onSelect });
    const node = graphNode(mounted, "gradus");
    const captured = new Set<number>();
    Object.assign(node, {
      setPointerCapture: (pointerId: number) => captured.add(pointerId),
      hasPointerCapture: (pointerId: number) => captured.has(pointerId),
      releasePointerCapture: (pointerId: number) => captured.delete(pointerId),
    });

    act(() => {
      pointer(node, "pointerdown", {
        pointerId: 17,
        clientX: 40,
        clientY: 40,
      });
      pointer(node, "pointermove", {
        pointerId: 17,
        clientX: 70,
        clientY: 40,
      });
      window.dispatchEvent(new Event("blur"));
    });

    expect(captured.has(17)).toBe(false);

    act(() => {
      node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith("gradus");
  });

  it("cancels the existing drag before another pointer takes ownership", () => {
    const onSelect = vi.fn();
    const mounted = mountGraphMap(data, { onSelect });
    const gradus = graphNode(mounted, "gradus");
    const music = graphNode(mounted, "music");
    const gradusCapture = new Set<number>();
    const musicCapture = new Set<number>();
    Object.assign(gradus, {
      setPointerCapture: (pointerId: number) => gradusCapture.add(pointerId),
      hasPointerCapture: (pointerId: number) =>
        gradusCapture.has(pointerId),
      releasePointerCapture: (pointerId: number) =>
        gradusCapture.delete(pointerId),
    });
    Object.assign(music, {
      setPointerCapture: (pointerId: number) => musicCapture.add(pointerId),
      hasPointerCapture: (pointerId: number) => musicCapture.has(pointerId),
      releasePointerCapture: (pointerId: number) =>
        musicCapture.delete(pointerId),
    });

    act(() => {
      pointer(gradus, "pointerdown", {
        pointerId: 18,
        clientX: 40,
        clientY: 40,
      });
      pointer(gradus, "pointermove", {
        pointerId: 18,
        clientX: 70,
        clientY: 40,
      });
      pointer(music, "pointerdown", {
        pointerId: 19,
        clientX: 100,
        clientY: 100,
      });
    });

    expect(gradusCapture.has(18)).toBe(false);
    expect(musicCapture.has(19)).toBe(true);
    const secondPointerLines = lineEndpoints(mounted);

    act(() => {
      pointer(gradus, "pointermove", {
        pointerId: 18,
        clientX: 140,
        clientY: 40,
      });
    });
    expect(lineEndpoints(mounted)).toEqual(secondPointerLines);

    act(() => {
      pointer(music, "pointercancel", {
        pointerId: 19,
        clientX: 100,
        clientY: 100,
      });
      gradus.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onSelect).toHaveBeenCalledWith("gradus");
  });

  it("applies hover and keyboard focus dimming, preserves focus after hover, and clears it on blur", () => {
    const mounted = mountGraphMap(data);
    const gradus = graphNode(mounted, "gradus");
    const music = graphNode(mounted, "music");
    const appliedAi = graphNode(mounted, "applied-ai");

    act(() => {
      music.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(music.classList).toContain("is-active");
    expect(appliedAi.classList).toContain("is-dimmed");

    act(() => {
      music.focus();
      gradus.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      gradus.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(music.classList).toContain("is-active");
    expect(appliedAi.classList).toContain("is-dimmed");

    act(() => music.blur());
    expect(appliedAi.classList).not.toContain("is-dimmed");
  });

  it("returns a selected node to resting size when transient focus ends", () => {
    const mounted = mountGraphMap(data, { selectedId: "music" });
    const music = graphNode(mounted, "music");
    const mark = music.querySelector<SVGElement>(".graph-node-mark");
    if (!mark) throw new Error("Missing graph node mark");

    expect(mark.style.transform).toBe("scale(1.15)");

    act(() => {
      music.focus();
      music.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(mark.style.transform).toBe("scale(1.42)");

    act(() => {
      music.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    });
    expect(music.classList).toContain("is-active");
    expect(mark.style.transform).toBe("scale(1.15)");
  });

  it("uses connectingFromId as the active focus neighborhood", () => {
    const mounted = mountGraphMap(data, {
      selectedId: "music",
      connectingFromId: "applied-ai",
    });

    expect(graphNode(mounted, "applied-ai").classList).toContain("is-active");
    expect(graphNode(mounted, "gradus").classList).not.toContain("is-dimmed");
    expect(graphNode(mounted, "music").classList).toContain("is-dimmed");
  });
});

describe("graph map markup", () => {
  it("keeps keyboard focus after the pointer leaves and clears it on blur", () => {
    expect(resolveGraphFocus("music", "gradus", "applied-ai")).toBe("music");
    expect(resolveGraphFocus(null, "gradus", null)).toBe("gradus");
    expect(resolveGraphFocus(null, null, null)).toBeNull();
  });

  it("does not dim unrelated nodes in initial markup just because one is selected", () => {
    const html = renderToStaticMarkup(
      <GraphMap
        data={data}
        selectedId="applied-ai"
        onSelect={vi.fn()}
        ariaLabel="Editable knowledge map"
      />
    );

    expect(html).not.toContain("is-dimmed");
  });

  it("dims the connection neighborhood when connection mode is active", () => {
    const html = renderToStaticMarkup(
      <GraphMap
        data={data}
        selectedId="music"
        connectingFromId="applied-ai"
        onSelect={vi.fn()}
        ariaLabel="Editable knowledge map"
      />
    );

    expect(resolveGraphFocus(null, null, "applied-ai")).toBe("applied-ai");
    expect(html).toContain("graph-map-edge is-semantic is-dimmed");
    expect(html).toContain("graph-map-node is-concept is-selected is-dimmed");
  });

  it("renders focusable SVG nodes with a single roving tab stop", () => {
    const html = renderToStaticMarkup(
      <GraphMap
        data={data}
        selectedId="applied-ai"
        onSelect={vi.fn()}
        ariaLabel="Editable knowledge map"
      />
    );

    expect(html).toContain("<svg");
    expect(html).not.toContain("<canvas");
    expect(html).toContain('aria-label="Editable knowledge map"');
    expect(html.match(/role="button"/g)).toHaveLength(3);
    expect(html.match(/tabindex="0"/g)).toHaveLength(1);
    expect(html).toContain('r="22"');
  });

  it("keeps static markup deterministic when edges arrive in a different order", () => {
    const render = (edges: GraphMapData["edges"]) =>
      renderToStaticMarkup(
        <GraphMap
          data={{ ...data, edges }}
          selectedId={null}
          onSelect={vi.fn()}
          ariaLabel="Editable knowledge map"
        />
      );

    expect(render([...data.edges].reverse())).toBe(render(data.edges));
  });

  it("keeps accented static markup and fallback tab order deterministic under shuffled rows", () => {
    const render = (graphData: GraphMapData) =>
      renderToStaticMarkup(
        <GraphMap
          data={graphData}
          selectedId={null}
          onSelect={vi.fn()}
          ariaLabel="Editable knowledge map"
        />
      );
    const shuffled = {
      nodes: [
        codeUnitData.nodes[1],
        codeUnitData.nodes[0],
        codeUnitData.nodes[2],
      ],
      edges: [...codeUnitData.edges].reverse(),
    };

    expect(render(shuffled)).toBe(render(codeUnitData));
    expect(render(shuffled)).toContain(
      'tabindex="0" data-graph-node="node:a"'
    );
  });

  it("uses the first sorted node as the fallback tab stop", () => {
    const html = renderToStaticMarkup(
      <GraphMap
        data={{
          ...data,
          nodes: data.nodes.map((node) => ({
            ...node,
            pinned: node.id === "music",
          })),
        }}
        selectedId={null}
        onSelect={vi.fn()}
        ariaLabel="Editable knowledge map"
      />
    );

    expect(html).toContain('tabindex="0" data-graph-node="applied-ai"');
  });

  it("labels only the five highest-degree nodes plus pinned nodes until focus reveals direct neighbors", () => {
    const nodes = Array.from({ length: 8 }, (_, index) => ({
      id: `node:${index}`,
      label: `Node ${index}`,
      type: "concept" as const,
      summary: null,
      href: null,
      pinned: index === 6,
    }));
    const edges = [
      { id: "0-1", s: "node:0", t: "node:1", kind: "tag" as const },
      { id: "0-2", s: "node:0", t: "node:2", kind: "tag" as const },
      { id: "0-3", s: "node:0", t: "node:3", kind: "tag" as const },
      { id: "0-4", s: "node:0", t: "node:4", kind: "tag" as const },
      { id: "0-5", s: "node:0", t: "node:5", kind: "tag" as const },
      { id: "1-2", s: "node:1", t: "node:2", kind: "link" as const },
      { id: "1-3", s: "node:1", t: "node:3", kind: "link" as const },
      { id: "2-3", s: "node:2", t: "node:3", kind: "link" as const },
      { id: "4-7", s: "node:4", t: "node:7", kind: "semantic" as const },
    ];
    const mounted = mountGraphMap(
      { nodes, edges },
      { selectedId: "node:0" }
    );

    const initialLabels = [...mounted.querySelectorAll(".graph-node-label")].map(
      (label) => label.textContent
    );
    expect(initialLabels).toEqual([
      "Node 0",
      "Node 1",
      "Node 2",
      "Node 3",
      "Node 4",
      "Node 6",
    ]);
    expect(initialLabels).not.toContain("Node 7");

    act(() => graphNode(mounted, "node:4").focus());

    expect(
      [...mounted.querySelectorAll(".graph-node-label")].map(
        (label) => label.textContent
      )
    ).toContain("Node 7");
  });
});
