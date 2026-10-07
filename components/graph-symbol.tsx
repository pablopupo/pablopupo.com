import type { CSSProperties } from "react";

export default function GraphSymbol({ type, x, y, size, className, style }: {
  type: "project" | "concept" | "music" | "writing";
  x: number; y: number; size: number; className?: string; style?: CSSProperties;
}) {
  const props = { className, style };
  if (type === "music") return <path {...props} d={`M ${x} ${y - size} L ${x + size} ${y} L ${x} ${y + size} L ${x - size} ${y} Z`} />;
  if (type === "writing") return <rect {...props} x={x - size} y={y - size} width={size * 2} height={size * 2} rx={1} />;
  return <circle {...props} cx={x} cy={y} r={size} />;
}
