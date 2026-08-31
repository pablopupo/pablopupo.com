// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicGraphData } from "@/lib/public-graph";
import KnowledgeGraph from "./knowledge-graph";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
  }
  container?.remove();
  Reflect.deleteProperty(document, "startViewTransition");
  Reflect.deleteProperty(window, "matchMedia");
  document.documentElement.classList.remove("graph-inspector-transition");
  root = null;
  container = null;
});

function mountKnowledgeGraph(data: PublicGraphData) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<KnowledgeGraph data={data} />));
  return container;
}

function graphNode(element: ParentNode, id: string) {
  const node = element.querySelector<SVGGElement>(`[data-graph-node="${id}"]`);
  if (!node) throw new Error(`Missing graph node ${id}`);
  return node;
}

function selectGraphNode(element: ParentNode, id: string) {
  graphNode(element, id).dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true })
  );
}

function pointer(
  element: Element,
  type: "pointerdown" | "pointermove" | "pointerup",
  init: {
    pointerId: number;
    clientX: number;
    clientY: number;
    buttons?: number;
  }
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons:
      init.buttons ??
      (type === "pointerdown" || type === "pointermove" ? 1 : 0),
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperty(event, "pointerId", { value: init.pointerId });
  element.dispatchEvent(event);
}

function nodePosition(element: ParentNode, id: string) {
  const hitTarget = graphNode(element, id).querySelector(".graph-node-hit");
  return {
    x: hitTarget?.getAttribute("cx"),
    y: hitTarget?.getAttribute("cy"),
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

const identityGraph = {
  nodes: [
    {
      id: "applied-ai",
      label: "Applied AI",
      type: "concept",
      href: null,
      summary: "Systems that turn models into useful software.",
      isAnchor: true,
      priority: 100,
      deg: 2,
    },
    {
      id: "music",
      label: "Music",
      type: "concept",
      href: null,
      summary: "Classical piano, performance, and musical study.",
      isAnchor: true,
      priority: 100,
      deg: 1,
    },
    {
      id: "project:reader",
      label: "Reader",
      type: "project",
      href: "/work#reader",
      summary: "A document intelligence system for clinical work.",
      isAnchor: false,
      priority: 50,
      deg: 1,
    },
    {
      id: "project:gradus",
      label: "Gradus ad Parnassum",
      type: "project",
      href: "/work#gradus",
      summary: "Questions and answers grounded in musical notation.",
      isAnchor: false,
      priority: 60,
      deg: 2,
    },
  ],
  edges: [
    { s: "applied-ai", t: "project:reader", kind: "tag" },
    { s: "applied-ai", t: "project:gradus", kind: "tag" },
    { s: "music", t: "project:gradus", kind: "tag" },
  ],
} as unknown as PublicGraphData;

const connectedOrderGraph = {
  nodes: [
    {
      id: "project:selected",
      label: "Selected",
      type: "project",
      href: "/work#selected",
      summary: "Selected summary.",
      pinned: false,
      deg: 4,
    },
    {
      id: "concept:ä",
      label: "Same",
      type: "concept",
      href: null,
      summary: "Same late summary.",
      pinned: false,
      deg: 1,
    },
    {
      id: "concept:z",
      label: "Äther",
      type: "concept",
      href: null,
      summary: "Äther summary.",
      pinned: false,
      deg: 1,
    },
    {
      id: "concept:a",
      label: "Same",
      type: "concept",
      href: null,
      summary: "Same early summary.",
      pinned: false,
      deg: 1,
    },
    {
      id: "concept:pinned",
      label: "Zulu",
      type: "concept",
      href: null,
      summary: "Pinned summary.",
      pinned: true,
      deg: 1,
    },
  ],
  edges: [
    { s: "project:selected", t: "concept:ä", kind: "tag" },
    { s: "project:selected", t: "concept:z", kind: "tag" },
    { s: "project:selected", t: "concept:a", kind: "tag" },
    { s: "project:selected", t: "concept:pinned", kind: "tag" },
  ],
} as unknown as PublicGraphData;

describe("knowledge graph", () => {
  it("renders an interactive SVG map beside a neutral overview", () => {
    const html = renderToStaticMarkup(<KnowledgeGraph data={identityGraph} />);
    const svgPosition = html.indexOf("<svg");
    const inspectorPosition = html.indexOf("<aside");

    expect(html).toContain("<svg");
    expect(html).toContain('role="group"');
    expect(html).not.toContain("<canvas");
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).toContain("Knowledge map");
    expect(html).toContain("<h2>Explore the connections</h2>");
    expect(html).toContain(
      "Select a node to see how projects, notes, ideas, and music connect."
    );
    expect(inspectorPosition).toBeGreaterThan(svgPosition);
  });

  it("starts a native inspector transition and removes its root class when finished", async () => {
    const finish = deferred();
    const startViewTransition = vi.fn((update: () => void) => {
      update();
      return { finished: finish.promise } as ViewTransition;
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    });
    const mounted = mountKnowledgeGraph(identityGraph);

    act(() => selectGraphNode(mounted, "project:gradus"));

    expect(startViewTransition).toHaveBeenCalledOnce();
    expect(
      document.documentElement.classList.contains(
        "graph-inspector-transition"
      )
    ).toBe(true);
    expect(mounted.querySelector(".graph-inspector h2")?.textContent).toBe(
      "Gradus ad Parnassum"
    );

    await act(async () => {
      finish.resolve();
      await finish.promise;
    });

    expect(
      document.documentElement.classList.contains(
        "graph-inspector-transition"
      )
    ).toBe(false);
  });

  it("removes the root class when a native transition rejects", async () => {
    const finish = deferred();
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (update: () => void) => {
        update();
        return { finished: finish.promise } as ViewTransition;
      },
    });
    const mounted = mountKnowledgeGraph(identityGraph);

    act(() => selectGraphNode(mounted, "project:gradus"));

    await act(async () => {
      finish.reject(new Error("Skipped transition"));
      await finish.promise.catch(() => undefined);
    });

    expect(
      document.documentElement.classList.contains(
        "graph-inspector-transition"
      )
    ).toBe(false);
  });

  it("keeps the root class until the latest overlapping transition finishes", async () => {
    const transitions = [deferred(), deferred()];
    let transitionIndex = 0;
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: (update: () => void) => {
        update();
        const transition = transitions[transitionIndex];
        transitionIndex += 1;
        return { finished: transition.promise } as ViewTransition;
      },
    });
    const mounted = mountKnowledgeGraph(identityGraph);

    act(() => selectGraphNode(mounted, "project:gradus"));
    act(() => selectGraphNode(mounted, "project:reader"));

    await act(async () => {
      transitions[0].resolve();
      await transitions[0].promise;
    });
    expect(
      document.documentElement.classList.contains(
        "graph-inspector-transition"
      )
    ).toBe(true);

    await act(async () => {
      transitions[1].resolve();
      await transitions[1].promise;
    });
    expect(
      document.documentElement.classList.contains(
        "graph-inspector-transition"
      )
    ).toBe(false);
  });

  it("updates immediately without a native transition for reduced motion", () => {
    const startViewTransition = vi.fn();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
    Object.defineProperty(document, "startViewTransition", {
      configurable: true,
      value: startViewTransition,
    });
    const mounted = mountKnowledgeGraph(identityGraph);

    act(() => selectGraphNode(mounted, "project:gradus"));

    expect(startViewTransition).not.toHaveBeenCalled();
    expect(mounted.querySelector(".graph-inspector h2")?.textContent).toBe(
      "Gradus ad Parnassum"
    );
  });

  it("does not dim the initial map", () => {
    const html = renderToStaticMarkup(<KnowledgeGraph data={identityGraph} />);

    expect(html).not.toContain("is-dimmed");
  });

  it("selects a node and returns to the overview when it is selected again", () => {
    const mounted = mountKnowledgeGraph(identityGraph);
    const gradus = graphNode(mounted, "project:gradus");
    const overviewContent = mounted.querySelector(".graph-inspector-content");

    act(() => selectGraphNode(mounted, "project:gradus"));

    expect(gradus.getAttribute("aria-pressed")).toBe("true");
    const selectedContent = mounted.querySelector(".graph-inspector-content");
    expect(selectedContent).not.toBe(overviewContent);
    expect(mounted.querySelector(".graph-inspector h2")?.textContent).toBe(
      "Gradus ad Parnassum"
    );
    expect(mounted.querySelector(".graph-inspector-summary")?.textContent).toBe(
      "Questions and answers grounded in musical notation."
    );

    act(() => selectGraphNode(mounted, "project:gradus"));

    expect(gradus.getAttribute("aria-pressed")).toBe("false");
    expect(mounted.querySelector(".graph-inspector-content")).not.toBe(
      selectedContent
    );
    expect(mounted.querySelector(".graph-inspector h2")?.textContent).toBe(
      "Explore the connections"
    );
  });

  it("preserves dragged node positions when selection rerenders the inspector", () => {
    const mounted = mountKnowledgeGraph(identityGraph);
    const music = graphNode(mounted, "music");
    const captured = new Set<number>();
    Object.assign(music, {
      setPointerCapture: (pointerId: number) => captured.add(pointerId),
      hasPointerCapture: (pointerId: number) => captured.has(pointerId),
      releasePointerCapture: (pointerId: number) => captured.delete(pointerId),
    });
    const initialPosition = nodePosition(mounted, "music");

    act(() => {
      pointer(music, "pointerdown", {
        pointerId: 21,
        clientX: 100,
        clientY: 100,
      });
      pointer(music, "pointermove", {
        pointerId: 21,
        clientX: 150,
        clientY: 120,
      });
    });

    const draggedPosition = nodePosition(mounted, "music");
    expect(draggedPosition).not.toEqual(initialPosition);

    act(() => {
      pointer(music, "pointerup", {
        pointerId: 21,
        clientX: 150,
        clientY: 120,
      });
      music.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      selectGraphNode(mounted, "project:reader");
    });

    expect(
      graphNode(mounted, "project:reader").getAttribute("aria-pressed")
    ).toBe("true");
    expect(nodePosition(mounted, "music")).toEqual(draggedPosition);
  });

  it("offers the selected node's connections as deterministic controls", () => {
    const shuffled = {
      nodes: [
        connectedOrderGraph.nodes[2],
        connectedOrderGraph.nodes[4],
        connectedOrderGraph.nodes[1],
        connectedOrderGraph.nodes[0],
        connectedOrderGraph.nodes[3],
      ],
      edges: [...connectedOrderGraph.edges].reverse(),
    } as PublicGraphData;
    const mounted = mountKnowledgeGraph(shuffled);

    act(() => selectGraphNode(mounted, "project:selected"));

    const controls = [
      ...mounted.querySelectorAll<HTMLButtonElement>(
        ".graph-connections button"
      ),
    ];
    expect(controls.map((control) => control.textContent)).toEqual([
      "Zulu",
      "Same",
      "Same",
      "Äther",
    ]);

    act(() => controls[1]?.click());

    expect(
      graphNode(mounted, "concept:a").getAttribute("aria-pressed")
    ).toBe("true");
    expect(mounted.querySelector(".graph-inspector-summary")?.textContent).toBe(
      "Same early summary."
    );
  });

  it("updates the SVG and inspector from a connected-node control", () => {
    const mounted = mountKnowledgeGraph(identityGraph);
    act(() => selectGraphNode(mounted, "project:gradus"));
    const connectedControl = mounted.querySelector<HTMLButtonElement>(
      '.graph-connections button[aria-label="Select Applied AI"]'
    );
    if (!connectedControl) throw new Error("Missing connected node control");

    act(() => connectedControl.click());

    expect(
      graphNode(mounted, "applied-ai").getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      graphNode(mounted, "project:gradus").getAttribute("aria-pressed")
    ).toBe("false");
    expect(document.activeElement).toBe(graphNode(mounted, "applied-ai"));
    expect(mounted.querySelector(".graph-inspector h2")?.textContent).toBe(
      "Applied AI"
    );
  });

  it("shows a destination for a selected linked project", () => {
    const mounted = mountKnowledgeGraph(identityGraph);

    act(() => selectGraphNode(mounted, "project:reader"));

    const destination = mounted.querySelector<HTMLAnchorElement>(
      ".graph-destination"
    );
    expect(destination?.getAttribute("href")).toBe("/work#reader");
    expect(destination?.textContent).toContain("View project");
  });

  it("shows the empty state only when the map has no nodes", () => {
    const data = { nodes: [], edges: [] } as unknown as PublicGraphData;
    const html = renderToStaticMarkup(<KnowledgeGraph data={data} />);

    expect(html).toContain("The map will grow as work is published.");
    expect(html).not.toContain("<svg");
    expect(html).not.toContain("<aside");
  });

  it("removes the old legend and hover caption", () => {
    const html = renderToStaticMarkup(<KnowledgeGraph data={identityGraph} />);

    expect(html).not.toContain("graph-legend");
    expect(html).not.toContain("graph-caption");
    expect(html).not.toContain("hover or select a node");
  });
});
