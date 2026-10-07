"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  forceCollide,
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
import { layoutGraphLabels } from "./graph-label-layout";
import { graphStartPosition } from "./graph-start-layout";
import GraphSymbol from "./graph-symbol";

export type GraphMapNodeType = "concept" | "project" | "writing" | "music";

export type GraphMapNode = {
  id: string;
  label: string;
  shortLabel?: string;
  type: GraphMapNodeType;
  summary: string | null;
  href: string | null;
  pinned: boolean;
  hub?: "engineering" | "music";
};

export type GraphMapEdge = {
  id: string;
  s: string;
  t: string;
  kind: "tag" | "link" | "semantic";
};

export type GraphMapData = {
  nodes: GraphMapNode[];
  edges: GraphMapEdge[];
};

export function resolveGraphFocus(
  hoveredId: string | null,
  focusedId: string | null,
  connectingFromId: string | null
) {
  return hoveredId ?? focusedId ?? connectingFromId;
}

export type PositionedGraphNode = GraphMapNode & {
  x: number;
  y: number;
};

type Direction = "left" | "right" | "up" | "down";

type SimulationNode = PositionedGraphNode & {
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
};

type SimulationEdge = {
  source: string | SimulationNode;
  target: string | SimulationNode;
  kind: GraphMapEdge["kind"];
};

const WIDTH = 600;
const HEIGHT = 340;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
export function compareCodeUnits(left: string, right: string) {
  return left === right ? 0 : left < right ? -1 : 1;
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function visibleNodeRadius(node: GraphMapNode) {
  if (node.hub) return 11;
  if (node.type === "music") return 7;
  return node.type === "concept" ? 6 : 6.5;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function simulationStart(node: GraphMapNode, index: number, width: number, height: number) {
  const angle =
    index * GOLDEN_ANGLE + (hash(`${node.id}:angle`) / 0xffffffff) * 0.4;
  const radius =
    24 +
    (hash(`${node.id}:radius`) / 0xffffffff) * Math.min(width, height) * 0.34;
  return {
    x: width / 2 + Math.cos(angle) * radius,
    y: height / 2 + Math.sin(angle) * radius,
  };
}

function orderedGraphEdges(edges: GraphMapEdge[]) {
  return [...edges].sort(
    (left, right) =>
      compareCodeUnits(left.s, right.s) ||
      compareCodeUnits(left.t, right.t) ||
      compareCodeUnits(left.id, right.id)
  );
}

function graphSimulation(data: GraphMapData, width = WIDTH, height = HEIGHT, organic = false) {
  const hubX = (node: GraphMapNode) => width * (node.hub === "engineering" ? (width < 400 ? 0.4 : 0.28) : node.hub === "music" ? (width < 400 ? 0.6 : 0.72) : 0.5);
  const hubY = (node: GraphMapNode) => height * (node.hub === "engineering" ? (width < 400 ? 0.3 : 0.42) : node.hub === "music" ? (width < 400 ? 0.7 : 0.58) : 0.5);
  const nodes: SimulationNode[] = [...data.nodes]
    .sort((left, right) => compareCodeUnits(left.id, right.id))
    .map((node, index) => ({ ...node, ...simulationStart(node, index, width, height) }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = orderedGraphEdges(data.edges).filter(
    (edge) => nodeIds.has(edge.s) && nodeIds.has(edge.t)
  );
  const hubs = [nodes.find((node) => node.hub === "engineering"), nodes.find((node) => node.hub === "music")];
  const starts = new Map<string, { x: number; y: number }>();
  if (organic && hubs.every(Boolean)) {
    const neighbors = new Map(nodes.map((node) => [node.id, [] as string[]]));
    for (const edge of edges) {
      neighbors.get(edge.s)!.push(edge.t);
      neighbors.get(edge.t)!.push(edge.s);
    }
    const distances = hubs.map((hub) => {
      const distance = new Map([[hub!.id, 0]]);
      const queue = [hub!.id];
      for (let index = 0; index < queue.length; index++) {
        const id = queue[index];
        for (const neighbor of neighbors.get(id)!) if (!distance.has(neighbor)) {
          distance.set(neighbor, distance.get(id)! + 1);
          queue.push(neighbor);
        }
      }
      return distance;
    });
    const groups: SimulationNode[][] = [[], [], []];
    for (const node of nodes) {
      if (node.hub) { node.x = hubX(node); node.y = hubY(node); continue; }
      const engineering = distances[0].get(node.id) ?? Infinity;
      const music = distances[1].get(node.id) ?? Infinity;
      groups[engineering < music ? 0 : music < engineering ? 1 : 2].push(node);
    }
    // Seed neighbors near their area, then let the links and repulsion determine the layout.
    // This avoids tangled starting positions without pinning projects to lanes.
    groups.forEach((group, index) => group.forEach((node, position) => {
      const angle = position / group.length * Math.PI * 2 + 0.6;
      const centerX = index < 2 ? hubX(hubs[index]!) : width / 2;
      const centerY = index < 2 ? hubY(hubs[index]!) : height / 2;
      const radius = index < 2 ? 85 : 48;
      node.x = centerX + Math.cos(angle) * radius;
      node.y = centerY + Math.sin(angle) * radius;
    }));
    for (const node of nodes) {
      const start = graphStartPosition(node, width, height);
      if (start) {
        starts.set(node.id, start);
        Object.assign(node, start);
      }
    }
  }
  const simulationEdges: SimulationEdge[] = edges.map((edge) => ({
    source: edge.s,
    target: edge.t,
    kind: edge.kind,
  }));
  const simulation = forceSimulation<SimulationNode>(nodes)
    .force(
      "link",
      forceLink<SimulationNode, SimulationEdge>(simulationEdges)
        .id((node) => node.id)
        .distance((edge) => organic ? (edge.kind === "semantic" ? 130 : 96) :
          edge.kind === "semantic" ? 104 : edge.kind === "link" ? 72 : 84
        )
        .strength((edge) => (edge.kind === "semantic" ? 0.2 : 0.5))
    )
    .force(
      "charge",
      forceManyBody<SimulationNode>().strength((node) =>
        organic ? -260 : node.type === "concept" ? -150 : -220
      )
    )
    .force(
      "collide",
      forceCollide<SimulationNode>((node) => organic ? (node.hub ? 48 : 37) : visibleNodeRadius(node) + 12).iterations(organic ? 3 : 1)
    )
    .force("x", forceX<SimulationNode>((node) => starts.get(node.id)?.x ?? (organic ? hubX(node) : width / 2)).strength((node) => starts.has(node.id) ? 0.12 : organic && node.hub ? 0.35 : width < 400 ? 0.14 : organic ? 0.025 : 0.04))
    .force("y", forceY<SimulationNode>((node) => starts.get(node.id)?.y ?? (organic ? hubY(node) : height / 2)).strength((node) => starts.has(node.id) ? 0.12 : organic && node.hub ? 0.35 : width < 400 ? 0.025 : 0.05));
  if (organic) {
    simulation.velocityDecay(0.48)
      .force("center", forceCenter<SimulationNode>(width / 2, height / 2).strength(0.08))
      .force("bounds", () => {
      // Keep the constellation in view without snapping nodes into rows or columns.
      for (const node of nodes) {
        const nextX = node.x + (node.vx ?? 0);
        const nextY = node.y + (node.vy ?? 0);
        node.vx = (node.vx ?? 0) + (clamp(nextX, 48, width - 48) - nextX) * 0.6;
        node.vy = (node.vy ?? 0) + (clamp(nextY, 30, height - 46) - nextY) * 0.6;
      }
    });
  }
  return { nodes, simulation, starts };
}

export function layoutGraph(data: GraphMapData, width = WIDTH, height = HEIGHT, organic = false): PositionedGraphNode[] {
  const { nodes, simulation, starts } = graphSimulation(data, width, height, organic);
  simulation.stop();
  // Hold the opening composition while any new, unplaced entries settle around
  // it. These constraints are removed before the interactive map is created.
  for (const node of nodes) {
    const start = starts.get(node.id);
    if (start) { node.fx = start.x; node.fy = start.y; }
  }
  simulation.tick(280);
  for (const node of nodes) {
    if (starts.has(node.id)) { delete node.fx; delete node.fy; }
  }

  return nodes
    .map((node) => ({
      ...node,
      // Browser and server trig can differ in the last decimal places.
      x: Math.round(clamp(node.x, visibleNodeRadius(node), width - visibleNodeRadius(node)) * 1000) / 1000,
      y: Math.round(clamp(node.y, visibleNodeRadius(node), height - visibleNodeRadius(node)) * 1000) / 1000,
    }))
    .sort((left, right) => compareCodeUnits(left.id, right.id));
}

export type GraphDragState = {
  id: string;
  clientX: number;
  clientY: number;
  graphX: number;
  graphY: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  dragging: boolean;
};

export type GraphDragEffect = {
  id: string;
  x: number;
  y: number;
  fixed: boolean;
};

export type GraphDragInteraction = {
  drag: GraphDragState | null;
  suppressClick: boolean;
  effect: GraphDragEffect | null;
};

type GraphDragAction =
  | {
      type: "start";
      id: string;
      clientX: number;
      clientY: number;
      graphX: number;
      graphY: number;
      originX: number;
      originY: number;
    }
  | {
      type: "move";
      clientX: number;
      clientY: number;
      graphX: number;
      graphY: number;
    }
  | { type: "release" | "cancel" };

export function reduceGraphDrag(
  current: GraphDragInteraction | null,
  action: GraphDragAction
): GraphDragInteraction {
  const interaction = current ?? {
    drag: null,
    suppressClick: false,
    effect: null,
  };
  if (action.type === "start") {
    return {
      drag: {
        id: action.id,
        clientX: action.clientX,
        clientY: action.clientY,
        graphX: action.graphX,
        graphY: action.graphY,
        originX: action.originX,
        originY: action.originY,
        x: action.originX,
        y: action.originY,
        dragging: false,
      },
      suppressClick: false,
      effect: null,
    };
  }
  const drag = interaction.drag;
  if (!drag) {
    return {
      ...interaction,
      suppressClick: action.type === "cancel" ? false : interaction.suppressClick,
      effect: null,
    };
  }
  if (action.type === "move") {
    const exceedsThreshold =
      Math.hypot(action.clientX - drag.clientX, action.clientY - drag.clientY) >= 3;
    if (!drag.dragging && !exceedsThreshold) {
      return { ...interaction, effect: null };
    }
    const nextDrag = {
      ...drag,
      dragging: true,
      x: drag.originX + action.graphX - drag.graphX,
      y: drag.originY + action.graphY - drag.graphY,
    };
    return {
      drag: nextDrag,
      suppressClick: true,
      effect: {
        id: nextDrag.id,
        x: nextDrag.x,
        y: nextDrag.y,
        fixed: true,
      },
    };
  }
  const effect = drag.dragging
    ? { id: drag.id, x: drag.x, y: drag.y, fixed: false }
    : null;
  return {
    drag: null,
    suppressClick: action.type === "release" && drag.dragging,
    effect,
  };
}

function positionedNodes(nodes: SimulationNode[], width: number, height: number): PositionedGraphNode[] {
  return nodes
    .map((node) => {
      const radius = visibleNodeRadius(node);
      node.x = clamp(node.x, radius, width - radius);
      node.y = clamp(node.y, radius, height - radius);
      if (node.fx !== null && node.fx !== undefined) {
        node.fx = clamp(node.fx, radius, width - radius);
      }
      if (node.fy !== null && node.fy !== undefined) {
        node.fy = clamp(node.fy, radius, height - radius);
      }
      return { ...node };
    })
    .sort((left, right) => compareCodeUnits(left.id, right.id));
}

export function directionalGraphNode(
  nodes: PositionedGraphNode[],
  currentId: string,
  direction: Direction
) {
  const current = nodes.find((node) => node.id === currentId);
  if (!current) return null;
  const vector = {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
  }[direction];
  const candidates = nodes.flatMap((node) => {
    if (node.id === current.id) return [];
    const dx = node.x - current.x;
    const dy = node.y - current.y;
    const forward = dx * vector.x + dy * vector.y;
    if (forward <= 0) return [];
    const sideways = Math.abs(dx * vector.y - dy * vector.x);
    return [{ id: node.id, score: Math.hypot(dx, dy) + sideways * 1.5 }];
  });
  candidates.sort(
    (left, right) =>
      left.score - right.score || compareCodeUnits(left.id, right.id)
  );
  return candidates[0]?.id ?? null;
}

function nodeShape(node: PositionedGraphNode, scale: number) {
  return <GraphSymbol type={node.type} x={node.x} y={node.y}
    size={node.hub ? 10 : node.type === "concept" ? 4 : node.type === "music" ? 7 : node.type === "writing" ? 5.5 : 6.5}
    className="graph-node-mark" style={{ transform: `scale(${scale})` }} />;
}

type GraphMapProps = {
  data: GraphMapData;
  selectedId: string | null;
  onSelect: (id: string) => void;
  ariaLabel: string;
  connectingFromId?: string | null;
  layout?: "force" | "organic";
  hubStyle?: "rings" | "halo" | "names";
  highlightedIds?: Set<string> | null;
  compact?: boolean;
};

function subscribeToViewport(onChange: () => void) {
  const query = window.matchMedia?.("(max-width: 520px)");
  query?.addEventListener?.("change", onChange);
  return () => query?.removeEventListener?.("change", onChange);
}

function isNarrowViewport() {
  return window.matchMedia?.("(max-width: 520px)").matches ?? false;
}

export default function GraphMap({
  data,
  selectedId,
  onSelect,
  ariaLabel,
  connectingFromId = null,
  layout = "force",
  hubStyle = "rings",
  highlightedIds = null,
  compact = false,
}: GraphMapProps) {
  const narrow = useSyncExternalStore(subscribeToViewport, isNarrowViewport, () => false);
  const width = narrow ? 360 : WIDTH;
  const height = layout === "organic" ? (narrow ? compact ? 440 : 620 : 420) : narrow ? 400 : HEIGHT;
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const initialNodes = useMemo(() => layoutGraph(data, width, height, layout === "organic"), [data, width, height, layout]);
  const [nodes, setNodes] = useState(initialNodes);
  const simulationRef = useRef<ReturnType<typeof graphSimulation> | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const dragRef = useRef<GraphDragInteraction>({
    drag: null,
    suppressClick: false,
    effect: null,
  });
  const activePointerTargetRef = useRef<SVGGElement | null>(null);
  const removePointerFallbacksRef = useRef<(() => void) | null>(null);

  useEffect(
    () => () => {
      removePointerFallbacksRef.current?.();
      removePointerFallbacksRef.current = null;
    },
    []
  );

  useEffect(() => {
    const graph = graphSimulation(data, width, height, layout === "organic");
    const initialPositions = new Map(
      initialNodes.map((node) => [node.id, node])
    );
    for (const node of graph.nodes) {
      const position = initialPositions.get(node.id);
      if (!position) continue;
      node.x = position.x;
      node.y = position.y;
    }
    graph.simulation.stop();
    graph.simulation.on("tick", () => setNodes(positionedNodes(graph.nodes, width, height)));
    simulationRef.current = graph;
    setNodes(initialNodes);

    return () => {
      graph.simulation.stop();
      if (simulationRef.current === graph) simulationRef.current = null;
    };
  }, [data, initialNodes, width, height, layout]);

  const labels = useMemo(() => layoutGraphLabels(nodes, width, height, layout === "organic" ? data.edges : []), [nodes, width, height, layout, data.edges]);
  const positions = new Map(nodes.map((node) => [node.id, node]));
  const neighbors = new Map<string, Set<string>>();
  for (const node of nodes) neighbors.set(node.id, new Set());
  const edges = orderedGraphEdges(data.edges).filter(
    (edge) => neighbors.has(edge.s) && neighbors.has(edge.t)
  );
  for (const edge of edges) {
    neighbors.get(edge.s)?.add(edge.t);
    neighbors.get(edge.t)?.add(edge.s);
  }
  const focusId = resolveGraphFocus(hoveredId, focusedId, connectingFromId);
  const emphasizedId = focusId ?? selectedId;
  const neighborhood = emphasizedId ? neighbors.get(emphasizedId) ?? new Set() : new Set();
  const tabStop =
    selectedId && positions.has(selectedId)
      ? selectedId
      : nodes.find((node) => node.hub === "engineering")?.id ?? nodes.find((node) => node.hub)?.id ?? nodes[0]?.id ?? null;

  function keyDown(
    event: KeyboardEvent<SVGGElement>,
    node: PositionedGraphNode
  ) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(node.id);
      return;
    }
    const direction = {
      ArrowLeft: "left",
      ArrowRight: "right",
      ArrowUp: "up",
      ArrowDown: "down",
    }[event.key] as Direction | undefined;
    if (!direction) return;
    event.preventDefault();
    const nextId = directionalGraphNode(nodes, node.id, direction);
    if (!nextId) return;
    onSelect(nextId);
    requestAnimationFrame(() => {
      document
        .querySelector<SVGGElement>(`[data-graph-node="${nextId}"]`)
        ?.focus();
    });
  }

  function pointerPosition(event: PointerEvent<SVGGElement>) {
    const svg = event.currentTarget.ownerSVGElement;
    const matrix = svg?.getScreenCTM?.();
    if (matrix) {
      const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
      return { x: point.x, y: point.y };
    }
    const bounds = svg?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) {
      return { x: event.clientX, y: event.clientY };
    }
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * width,
      y: ((event.clientY - bounds.top) / bounds.height) * height,
    };
  }

  function refreshPositions() {
    const graph = simulationRef.current;
    if (graph) setNodes(positionedNodes(graph.nodes, width, height));
  }

  function applyDragEffect(effect: GraphDragEffect | null) {
    if (!effect) return;
    const graph = simulationRef.current;
    const node = graph?.nodes.find((candidate) => candidate.id === effect.id);
    if (!node || !graph) return;
    node.x = effect.x;
    node.y = effect.y;
    node.fx = effect.fixed ? effect.x : null;
    node.fy = effect.fixed ? effect.y : null;
    refreshPositions();
    if (layout === "organic" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (effect.fixed) {
      graph.simulation.alpha(0.45).restart();
      return;
    }
    graph.simulation.alphaTarget(0).alpha(0.45).restart();
  }

  function finishPointerDrag(
    pointerId: number,
    type: "release" | "cancel"
  ) {
    if (pointerIdRef.current !== pointerId) return;
    const target = activePointerTargetRef.current;
    pointerIdRef.current = null;
    activePointerTargetRef.current = null;
    removePointerFallbacksRef.current?.();
    removePointerFallbacksRef.current = null;
    if (target?.hasPointerCapture(pointerId)) {
      target.releasePointerCapture(pointerId);
    }
    dragRef.current = reduceGraphDrag(dragRef.current, { type });
    applyDragEffect(dragRef.current.effect);
  }

  function watchForOutsidePointerRelease(pointerId: number) {
    removePointerFallbacksRef.current?.();
    const pointerEnd = (event: globalThis.PointerEvent) => {
      if (event.pointerId === pointerId) {
        finishPointerDrag(pointerId, "cancel");
      }
    };
    const windowBlur = () => finishPointerDrag(pointerId, "cancel");
    window.addEventListener("pointerup", pointerEnd);
    window.addEventListener("pointercancel", pointerEnd);
    window.addEventListener("blur", windowBlur);
    removePointerFallbacksRef.current = () => {
      window.removeEventListener("pointerup", pointerEnd);
      window.removeEventListener("pointercancel", pointerEnd);
      window.removeEventListener("blur", windowBlur);
    };
  }

  function pointerDown(
    event: PointerEvent<SVGGElement>,
    node: PositionedGraphNode
  ) {
    if (event.button !== 0) return;
    const activePointerId = pointerIdRef.current;
    if (activePointerId !== null) {
      finishPointerDrag(activePointerId, "cancel");
    }
    const position = pointerPosition(event);
    pointerIdRef.current = event.pointerId;
    dragRef.current = reduceGraphDrag(dragRef.current, {
      type: "start",
      id: node.id,
      clientX: event.clientX,
      clientY: event.clientY,
      graphX: position.x,
      graphY: position.y,
      originX: node.x,
      originY: node.y,
    });
    activePointerTargetRef.current = event.currentTarget;
    event.currentTarget.setPointerCapture(event.pointerId);
    watchForOutsidePointerRelease(event.pointerId);
  }

  function pointerMove(event: PointerEvent<SVGGElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    if ((event.buttons & 1) === 0) {
      finishPointerDrag(event.pointerId, "cancel");
      return;
    }
    const position = pointerPosition(event);
    dragRef.current = reduceGraphDrag(dragRef.current, {
      type: "move",
      clientX: event.clientX,
      clientY: event.clientY,
      graphX: position.x,
      graphY: position.y,
    });
    if (!dragRef.current.drag?.dragging) return;
    event.preventDefault();
    applyDragEffect(dragRef.current.effect);
  }

  function pointerEnd(
    event: PointerEvent<SVGGElement>,
    type: "release" | "cancel"
  ) {
    finishPointerDrag(event.pointerId, type);
  }

  return (
    <svg
      className={`graph-map hub-style-${hubStyle}${layout === "organic" ? " graph-map-organic" : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      role="group"
      aria-label={ariaLabel}
    >
      <g className="graph-map-edges" aria-hidden="true">
        {edges.map((edge) => {
          const source = positions.get(edge.s);
          const target = positions.get(edge.t);
          if (!source || !target) return null;
          const active =
            emphasizedId === source.id ||
            emphasizedId === target.id ||
            (connectingFromId === source.id && selectedId === target.id) ||
            (connectingFromId === target.id && selectedId === source.id);
          const className = [
                "graph-map-edge",
                `is-${edge.kind}`,
                active ? "is-active" : "",
                ((layout === "organic" ? emphasizedId : focusId) && !active) || (highlightedIds && !highlightedIds.has(source.id) && !highlightedIds.has(target.id)) ? "is-dimmed" : "",
              ]
                .filter(Boolean)
                .join(" ");
          return (
            <line
              key={edge.id}
              className={className}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
            />
          );
        })}
      </g>
      <g className="graph-map-nodes">
        {nodes.map((node) => {
          const label = labels.get(node.id)!;
          const selected = selectedId === node.id;
          const active = focusId === node.id;
          const connecting = connectingFromId === node.id;
          const neighboring = neighborhood.has(node.id);
          const dimmed = Boolean((focusId && !active && !neighboring) || (highlightedIds && !highlightedIds.has(node.id) && !active));
          const nodeScale = hoveredId === node.id || connecting ? 1.42 : 1.15;
          const showLabel =
            layout === "organic" ||
            node.type !== "concept" ||
            node.pinned ||
            active ||
            selected ||
            neighboring;
          return (
            <g
              key={node.id}
              className={[
                "graph-map-node",
                `is-${node.type}`,
                node.hub ? "is-hub" : "",
                selected ? "is-selected" : "",
                active ? "is-active" : "",
                highlightedIds?.has(node.id) ? "is-search-match" : "",
                neighboring ? "is-neighbor" : "",
                dimmed ? "is-dimmed" : "",
                connecting ? "is-connecting" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              role="button"
              aria-label={`Select ${node.label}`}
              aria-pressed={selected}
              tabIndex={tabStop === node.id ? 0 : -1}
              data-graph-node={node.id}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setFocusedId(node.id)}
              onBlur={() => setFocusedId(null)}
              onClick={() => {
                if (dragRef.current.suppressClick) {
                  dragRef.current = {
                    ...dragRef.current,
                    suppressClick: false,
                    effect: null,
                  };
                  return;
                }
                onSelect(node.id);
              }}
              onKeyDown={(event) => keyDown(event, node)}
              onPointerDown={(event) => pointerDown(event, node)}
              onPointerMove={pointerMove}
              onPointerUp={(event) => pointerEnd(event, "release")}
              onPointerCancel={(event) => pointerEnd(event, "cancel")}
              onLostPointerCapture={(event) =>
                finishPointerDrag(event.pointerId, "cancel")
              }
            >
              <circle
                className="graph-node-hit"
                cx={node.x}
                cy={node.y}
                r={22}
              />
              {selected && (
                <circle className="graph-node-ring" cx={node.x} cy={node.y} r={node.hub ? 18 : 13} />
              )}
              {nodeShape(node, nodeScale)}
              {node.hub && hubStyle === "halo" && <circle className="graph-hub-halo" cx={node.x} cy={node.y} r={19} />}
              {showLabel && (
                <text
                  className="graph-node-label"
                  x={node.x + label.dx}
                  y={node.y + label.dy}
                  aria-hidden="true"
                >
                  {label.lines.map((line, index) => (
                    <tspan key={index} x={node.x + label.dx} dy={index === 0 ? 0 : 16}>
                      {line}{index < label.lines.length - 1 ? " " : ""}
                    </tspan>
                  ))}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
