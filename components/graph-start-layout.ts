import type { GraphMapNode } from "./graph-map";

type Point = readonly [number, number];
type Placement = { desktop: Point; mobile: Point };

// Opening composition based on Pablo's reference. Paths and topic names work
// with both local content and database IDs. New entries still use the forces.
const placements: Record<string, Placement> = {
  engineering: { desktop: [200, 185], mobile: [166, 164] },
  music: { desktop: [445, 240], mobile: [223, 454] },
  "/work/nova": { desktop: [175, 80], mobile: [110, 45] },
  payments: { desktop: [280, 70], mobile: [258, 50] },
  "/accordo": { desktop: [338, 170], mobile: [276, 222] },
  "/work/kit-ai": { desktop: [126, 257], mobile: [66, 254] },
  "on-device ai": { desktop: [48, 190], mobile: [54, 127] },
  "emergency medicine": { desktop: [48, 322], mobile: [44, 365] },
  retrieval: { desktop: [220, 302], mobile: [128, 385] },
  "/work/gradus-ad-parnassum": { desktop: [310, 235], mobile: [181, 300] },
  "musical notation": { desktop: [330, 350], mobile: [135, 535] },
  "/music/why-im-building-accordo": { desktop: [367, 282], mobile: [307, 314] },
  "/music/composition-in-e-flat-major": { desktop: [516, 157], mobile: [305, 397] },
  "/music/beethoven-sonata-op-10-no-2": { desktop: [552, 224], mobile: [310, 513] },
  "/music/schumann-abegg-variations": { desktop: [535, 302], mobile: [247, 572] },
};

export function graphStartPosition(node: GraphMapNode, width: number, height: number) {
  const key = node.hub ?? node.href ?? (node.type === "concept" ? node.label.toLowerCase() : "");
  if (!Object.hasOwn(placements, key)) return null;
  const placement = placements[key];
  const narrow = width < 400;
  const [x, y] = narrow ? placement.mobile : placement.desktop;
  return { x: x / (narrow ? 360 : 600) * width, y: y / (narrow ? 620 : 420) * height };
}
