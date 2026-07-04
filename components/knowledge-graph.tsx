"use client";

import { useEffect, useRef, useState } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
import graph from "../data/graph.generated.json";

type NodeType = "project" | "oss" | "concept" | "writing";

type SimNode = {
  id: string;
  label: string;
  type: NodeType;
  href: string | null;
  deg: number;
  x: number;
  y: number;
  fx?: number | null;
  fy?: number | null;
};

type SimEdge = {
  s: string;
  t: string;
  kind: "tag" | "link" | "semantic";
  terms?: string[];
  source: SimNode;
  target: SimNode;
};

type Theme = {
  bg: string;
  ink: string;
  muted: string;
  accent: string;
  hairline: string;
  mono: string;
};

const TYPE_LABELS: Record<NodeType, string> = {
  project: "projects",
  oss: "open source",
  concept: "concepts",
  writing: "writing",
};

const TYPE_GLYPHS: Record<NodeType, string> = {
  project: "●",
  oss: "•",
  concept: "○",
  writing: "◉",
};

function radius(node: SimNode): number {
  const base = { project: 4.5, oss: 3.2, concept: 3.4, writing: 4 }[node.type];
  return base + Math.min(node.deg * 0.35, 2.5);
}

function readTheme(): Theme {
  const style = getComputedStyle(document.documentElement);
  return {
    bg: style.getPropertyValue("--bg").trim(),
    ink: style.getPropertyValue("--ink").trim(),
    muted: style.getPropertyValue("--muted").trim(),
    accent: style.getPropertyValue("--accent").trim(),
    hairline: style.getPropertyValue("--hairline").trim(),
    mono: style.getPropertyValue("--mono").trim() || "monospace",
  };
}

export default function KnowledgeGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<{
    nodes: SimNode[];
    edges: SimEdge[];
    neighbors: Map<string, Set<string>>;
    sim: ReturnType<typeof forceSimulation<SimNode>> | null;
    theme: Theme | null;
    hovered: SimNode | null;
    selected: SimNode | null;
    hidden: Set<NodeType>;
    labeled: Set<string>;
    width: number;
    height: number;
    reducedMotion: boolean;
    paint?: () => void;
  } | null>(null);
  const [caption, setCaption] = useState("hover to explore · click to open");
  const [hidden, setHidden] = useState<Set<NodeType>>(new Set());

  const presentTypes = Array.from(
    new Set((graph.nodes as { type: NodeType }[]).map((n) => n.type))
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;

    const nodes: SimNode[] = (graph.nodes as SimNode[]).map((n) => ({ ...n }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const edges: SimEdge[] = (graph.edges as SimEdge[])
      .filter((e) => byId.has(e.s) && byId.has(e.t))
      .map((e) => ({ ...e, source: byId.get(e.s)!, target: byId.get(e.t)! }));

    const neighbors = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!neighbors.has(e.s)) neighbors.set(e.s, new Set());
      if (!neighbors.has(e.t)) neighbors.set(e.t, new Set());
      neighbors.get(e.s)!.add(e.t);
      neighbors.get(e.t)!.add(e.s);
    }

    const labeled = new Set(
      [...nodes]
        .sort((a, b) => b.deg - a.deg)
        .slice(0, 5)
        .map((n) => n.id)
    );

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const state = {
      nodes,
      edges,
      neighbors,
      sim: null as ReturnType<typeof forceSimulation<SimNode>> | null,
      theme: readTheme(),
      hovered: null as SimNode | null,
      selected: null as SimNode | null,
      hidden: new Set<NodeType>(),
      labeled,
      width: 0,
      height: 0,
      reducedMotion,
      paint: undefined as (() => void) | undefined,
    };
    stateRef.current = state;

    function size() {
      const width = wrap!.clientWidth;
      const height = width < 480 ? 320 : 400;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      canvas!.style.height = `${height}px`;
      const ctx = canvas!.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      state.width = width;
      state.height = height;
    }

    function clamp() {
      const pad = 42;
      for (const n of state.nodes) {
        n.x = Math.max(pad, Math.min(state.width - pad, n.x));
        n.y = Math.max(pad, Math.min(state.height - pad, n.y));
      }
    }

    function paint() {
      const ctx = canvas!.getContext("2d");
      const t = state.theme;
      if (!ctx || !t) return;
      clamp();
      ctx.clearRect(0, 0, state.width, state.height);

      const active = state.hovered || state.selected;
      const hood = active ? state.neighbors.get(active.id) || new Set() : null;

      for (const e of state.edges) {
        const a = e.source;
        const b = e.target;
        const typeHidden = state.hidden.has(a.type) || state.hidden.has(b.type);
        const inHood = active && (a === active || b === active);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.setLineDash(e.kind === "semantic" ? [3, 4] : []);
        if (inHood) {
          ctx.strokeStyle = t.accent;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 1.2;
        } else {
          ctx.strokeStyle = t.ink;
          ctx.globalAlpha = typeHidden ? 0.03 : active ? 0.05 : e.kind === "semantic" ? 0.13 : 0.15;
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);

      for (const n of state.nodes) {
        const r = radius(n);
        const isActive = n === active;
        const inHood = hood ? hood.has(n.id) : false;
        const typeHidden = state.hidden.has(n.type);
        const dim = typeHidden ? 0.06 : active && !isActive && !inHood ? 0.12 : 1;

        ctx.globalAlpha = dim;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);

        if (n.type === "concept") {
          ctx.fillStyle = t.bg;
          ctx.fill();
          ctx.strokeStyle = isActive ? t.accent : t.ink;
          ctx.globalAlpha = dim * (isActive ? 1 : 0.55);
          ctx.lineWidth = 1.25;
          ctx.stroke();
        } else {
          ctx.fillStyle = isActive ? t.accent : t.ink;
          if (n.type === "oss" && !isActive) ctx.globalAlpha = dim * 0.72;
          ctx.fill();
          if (n.type === "writing") {
            ctx.globalAlpha = dim;
            ctx.beginPath();
            ctx.arc(n.x, n.y, r * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = t.bg;
            ctx.fill();
          }
        }

        if (isActive) {
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 3.5, 0, Math.PI * 2);
          ctx.strokeStyle = t.accent;
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        const showLabel = isActive || inHood || (state.labeled.has(n.id) && !typeHidden);
        if (showLabel) {
          ctx.globalAlpha = typeHidden ? 0.15 : 1;
          ctx.font = `10px ${t.mono}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          const y = n.y + r + 4;
          ctx.lineWidth = 3;
          ctx.strokeStyle = t.bg;
          ctx.strokeText(n.label, n.x, y);
          ctx.fillStyle = isActive ? t.accent : inHood ? t.ink : t.muted;
          ctx.fillText(n.label, n.x, y);
        }
      }
      ctx.globalAlpha = 1;
    }

    function settle(ticks: number) {
      state.nodes.forEach((node, i) => {
        const angle = i * 2.399963;
        const spread = 14 * Math.sqrt(i + 1);
        node.x = state.width / 2 + spread * Math.cos(angle);
        node.y = state.height / 2 + spread * Math.sin(angle);
      });
      const sim = forceSimulation<SimNode>(state.nodes)
        .force(
          "link",
          forceLink<SimNode, SimEdge>(state.edges)
            .id((d) => d.id)
            .distance((e) => (e.kind === "semantic" ? 72 : e.kind === "link" ? 46 : 56))
            .strength((e) => (e.kind === "semantic" ? 0.2 : 0.5))
        )
        .force(
          "charge",
          forceManyBody<SimNode>().strength((d) => (d.type === "concept" ? -85 : -130))
        )
        .force("collide", forceCollide<SimNode>((d) => radius(d) + 8))
        .force("x", forceX<SimNode>(state.width / 2).strength(0.09))
        .force("y", forceY<SimNode>(state.height / 2).strength(0.13))
        .stop();
      sim.tick(ticks);
      state.sim = sim;
      sim.on("tick", paint);
    }

    size();
    settle(300);
    state.paint = paint;
    paint();

    function hit(x: number, y: number): SimNode | null {
      let best: SimNode | null = null;
      let bestDist = Infinity;
      for (const n of state.nodes) {
        const d = Math.hypot(n.x - x, n.y - y);
        if (d < Math.max(radius(n) + 6, 11) && d < bestDist) {
          best = n;
          bestDist = d;
        }
      }
      return best;
    }

    function describe(node: SimNode | null) {
      if (!node) {
        setCaption("hover to explore · click to open");
        return;
      }
      const semantic = state.edges.filter(
        (e) => e.kind === "semantic" && (e.source === node || e.target === node)
      );
      const terms = [...new Set(semantic.flatMap((e) => e.terms || []))].slice(0, 4);
      const kind = node.type === "oss" ? "open source" : node.type;
      setCaption(
        terms.length
          ? `${node.label} · ${kind} · computed link: ${terms.join(", ")}`
          : `${node.label} · ${kind}`
      );
    }

    let dragNode: SimNode | null = null;
    let downAt: { x: number; y: number } | null = null;
    let moved = false;

    function pointer(ev: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }

    function onPointerDown(ev: PointerEvent) {
      const p = pointer(ev);
      dragNode = hit(p.x, p.y);
      downAt = p;
      moved = false;
      if (dragNode) canvas!.setPointerCapture(ev.pointerId);
    }

    function onPointerMove(ev: PointerEvent) {
      const p = pointer(ev);
      if (dragNode && downAt) {
        if (Math.hypot(p.x - downAt.x, p.y - downAt.y) > 3) moved = true;
        if (moved) {
          dragNode.fx = p.x;
          dragNode.fy = p.y;
          if (state.reducedMotion) {
            dragNode.x = p.x;
            dragNode.y = p.y;
            paint();
          } else if (state.sim) {
            if (state.sim.alpha() < 0.1) state.sim.alpha(0.25).restart();
          }
        }
        return;
      }
      const over = hit(p.x, p.y);
      if (over !== state.hovered) {
        state.hovered = over;
        canvas!.style.cursor = over && (over.href || over.type === "concept") ? "pointer" : "default";
        describe(over || state.selected);
        paint();
      }
    }

    function onPointerUp(ev: PointerEvent) {
      const node = dragNode;
      const wasDrag = moved;
      if (node) {
        node.fx = null;
        node.fy = null;
        state.sim?.alphaTarget(0);
      }
      dragNode = null;
      downAt = null;
      if (!node || wasDrag) return;

      if (ev.pointerType === "touch") {
        if (state.selected === node && node.href) {
          window.location.href = node.href;
        } else {
          state.selected = state.selected === node ? null : node;
          describe(state.selected);
          paint();
        }
        return;
      }
      if (node.href) {
        window.location.href = node.href;
      } else {
        state.selected = state.selected === node ? null : node;
        describe(state.selected);
        paint();
      }
    }

    function onPointerLeave() {
      state.hovered = null;
      describe(state.selected);
      paint();
    }

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => {
      state.theme = readTheme();
      paint();
    };
    media.addEventListener("change", onTheme);

    const observer = new ResizeObserver(() => {
      const prev = state.width;
      size();
      if (Math.abs(state.width - prev) > 4) {
        state.sim?.force("x", forceX<SimNode>(state.width / 2).strength(0.06));
        state.sim?.force("y", forceY<SimNode>(state.height / 2).strength(0.08));
        state.sim?.stop();
        state.sim?.tick(80);
      }
      paint();
    });
    observer.observe(wrap);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      media.removeEventListener("change", onTheme);
      observer.disconnect();
      state.sim?.stop();
    };
  }, []);

  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    state.hidden = hidden;
    state.paint?.();
  }, [hidden]);

  function toggle(type: NodeType) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  return (
    <div ref={wrapRef} className="graph-wrap">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="A map of the projects, open source contributions, concepts, and writing on this site, connected by shared ideas."
      />
      <div className="graph-foot">
        <div className="graph-legend">
          {presentTypes.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={!hidden.has(type)}
              className={hidden.has(type) ? "off" : ""}
              onClick={() => toggle(type)}
            >
              {TYPE_GLYPHS[type]} {TYPE_LABELS[type]}
            </button>
          ))}
        </div>
        <p className="graph-caption" aria-live="polite">
          {caption}
        </p>
      </div>
    </div>
  );
}
