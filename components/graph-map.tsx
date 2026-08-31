"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";

export type GraphMapNodeType = "concept" | "project" | "writing" | "music";

export type GraphMapNode = {
  id: string;
  label: string;
  type: GraphMapNodeType;
  summary: string | null;
  href: string | null;
  pinned: boolean;
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
  if (node.type === "music") return 7;
  return node.type === "concept" ? 6 : 6.5;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function simulationStart(node: GraphMapNode, index: number) {
  const angle =
    index * GOLDEN_ANGLE + (hash(`${node.id}:angle`) / 0xffffffff) * 0.4;
  const radius =
    24 +
    (hash(`${node.id}:radius`) / 0xffffffff) * Math.min(WIDTH, HEIGHT) * 0.34;
  return {
    x: WIDTH / 2 + Math.cos(angle) * radius,
    y: HEIGHT / 2 + Math.sin(angle) * radius,
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

function graphSimulation(data: GraphMapData) {
  const nodes: SimulationNode[] = [...data.nodes]
    .sort((left, right) => compareCodeUnits(left.id, right.id))
    .map((node, index) => ({ ...node, ...simulationStart(node, index) }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = orderedGraphEdges(data.edges).filter(
    (edge) => nodeIds.has(edge.s) && nodeIds.has(edge.t)
  );
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
        .distance((edge) =>
          edge.kind === "semantic" ? 104 : edge.kind === "link" ? 72 : 84
        )
        .strength((edge) => (edge.kind === "semantic" ? 0.2 : 0.5))
    )
    .force(
      "charge",
      forceManyBody<SimulationNode>().strength((node) =>
        node.type === "concept" ? -150 : -220
      )
    )
    .force(
      "collide",
      forceCollide<SimulationNode>((node) => visibleNodeRadius(node) + 12)
    )
    .force("x", forceX<SimulationNode>(WIDTH / 2).strength(0.04))
    .force("y", forceY<SimulationNode>(HEIGHT / 2).strength(0.05));
  return { nodes, simulation };
}

export function layoutGraph(data: GraphMapData): PositionedGraphNode[] {
  const { nodes, simulation } = graphSimulation(data);
  simulation.stop();
  simulation.tick(280);

  return nodes
    .map((node) => ({
      ...node,
      x: clamp(node.x, visibleNodeRadius(node), WIDTH - visibleNodeRadius(node)),
      y: clamp(node.y, visibleNodeRadius(node), HEIGHT - visibleNodeRadius(node)),
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

function positionedNodes(nodes: SimulationNode[]): PositionedGraphNode[] {
  return nodes
    .map((node) => {
      const radius = visibleNodeRadius(node);
      node.x = clamp(node.x, radius, WIDTH - radius);
      node.y = clamp(node.y, radius, HEIGHT - radius);
      if (node.fx !== null && node.fx !== undefined) {
        node.fx = clamp(node.fx, radius, WIDTH - radius);
      }
      if (node.fy !== null && node.fy !== undefined) {
        node.fy = clamp(node.fy, radius, HEIGHT - radius);
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
  const style = { transform: `scale(${scale})` };
  if (node.type === "music") {
    return (
      <path
        className="graph-node-mark"
        d={`M ${node.x} ${node.y - 7} L ${node.x + 7} ${node.y} L ${node.x} ${node.y + 7} L ${node.x - 7} ${node.y} Z`}
        style={style}
      />
    );
  }
  return (
    <circle
      className="graph-node-mark"
      cx={node.x}
      cy={node.y}
      r={node.type === "concept" ? 6 : 6.5}
      style={style}
    />
  );
}

type GraphMapProps = {
  data: GraphMapData;
  selectedId: string | null;
  onSelect: (id: string) => void;
  ariaLabel: string;
  connectingFromId?: string | null;
};

export default function GraphMap({
  data,
  selectedId,
  onSelect,
  ariaLabel,
  connectingFromId = null,
}: GraphMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const initialNodes = useMemo(() => layoutGraph(data), [data]);
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
    const graph = graphSimulation(data);
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
    graph.simulation.on("tick", () => setNodes(positionedNodes(graph.nodes)));
    simulationRef.current = graph;
    setNodes(initialNodes);

    return () => {
      graph.simulation.stop();
      if (simulationRef.current === graph) simulationRef.current = null;
    };
  }, [data, initialNodes]);

  const positions = new Map(nodes.map((node) => [node.id, node]));
  const neighbors = new Map<string, Set<string>>();
  const degree = new Map<string, number>();
  for (const node of nodes) neighbors.set(node.id, new Set());
  const edges = orderedGraphEdges(data.edges).filter(
    (edge) => neighbors.has(edge.s) && neighbors.has(edge.t)
  );
  for (const edge of edges) {
    neighbors.get(edge.s)?.add(edge.t);
    neighbors.get(edge.t)?.add(edge.s);
    degree.set(edge.s, (degree.get(edge.s) ?? 0) + 1);
    degree.set(edge.t, (degree.get(edge.t) ?? 0) + 1);
  }
  const restLabelIds = new Set(
    [...nodes]
      .sort(
        (left, right) =>
          (degree.get(right.id) ?? 0) - (degree.get(left.id) ?? 0) ||
          compareCodeUnits(left.label, right.label) ||
          compareCodeUnits(left.id, right.id)
      )
      .slice(0, 5)
      .map((node) => node.id)
  );
  const focusId = resolveGraphFocus(hoveredId, focusedId, connectingFromId);
  const neighborhood = focusId ? neighbors.get(focusId) ?? new Set() : new Set();
  const tabStop =
    selectedId && positions.has(selectedId)
      ? selectedId
      : nodes[0]?.id ?? null;

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
    const bounds = svg?.getBoundingClientRect();
    if (!bounds || bounds.width === 0 || bounds.height === 0) {
      return { x: event.clientX, y: event.clientY };
    }
    return {
      x: ((event.clientX - bounds.left) / bounds.width) * WIDTH,
      y: ((event.clientY - bounds.top) / bounds.height) * HEIGHT,
    };
  }

  function refreshPositions() {
    const graph = simulationRef.current;
    if (graph) setNodes(positionedNodes(graph.nodes));
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
      className="graph-map"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="group"
      aria-label={ariaLabel}
    >
      <g className="graph-map-edges" aria-hidden="true">
        {edges.map((edge) => {
          const source = positions.get(edge.s);
          const target = positions.get(edge.t);
          if (!source || !target) return null;
          const active =
            focusId === source.id ||
            focusId === target.id ||
            (connectingFromId === source.id && selectedId === target.id) ||
            (connectingFromId === target.id && selectedId === source.id);
          return (
            <line
              key={edge.id}
              className={[
                "graph-map-edge",
                `is-${edge.kind}`,
                active ? "is-active" : "",
                focusId && !active ? "is-dimmed" : "",
              ]
                .filter(Boolean)
                .join(" ")}
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
          const selected = selectedId === node.id;
          const active = focusId === node.id;
          const connecting = connectingFromId === node.id;
          const neighboring = neighborhood.has(node.id);
          const dimmed = Boolean(focusId && !active && !neighboring);
          const nodeScale = hoveredId === node.id || connecting ? 1.42 : 1.15;
          const showLabel =
            restLabelIds.has(node.id) ||
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
                selected ? "is-selected" : "",
                active ? "is-active" : "",
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
              {nodeShape(node, nodeScale)}
              {showLabel && (
                <text
                  className="graph-node-label"
                  x={node.x}
                  y={node.y + 20}
                  textAnchor="middle"
                >
                  {node.label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}
