type LabelNode = {
  id: string;
  label: string;
  shortLabel?: string;
  x: number;
  y: number;
  pinned: boolean;
  hub?: "engineering" | "music";
};

type Box = { x: number; y: number; width: number; height: number };

function overlap(a: Box, b: Box) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function wrapLabel(label: string, maxCharacters: number) {
  const lines = [""];
  for (const word of label.split(/\s+/)) {
    const last = lines.length - 1;
    if (lines[last] && lines[last].length + word.length + 1 > maxCharacters) {
      lines.push(word);
    } else {
      lines[last] = [lines[last], word].filter(Boolean).join(" ");
    }
  }
  return lines;
}

export function layoutGraphLabels(nodes: LabelNode[], width: number, height: number, edges: Array<{ s: string; t: string }> = []) {
  const positions = new Map(nodes.map((node) => [node.id, node]));
  const occupied: Box[] = nodes.map((node) => ({
    x: node.x - (node.hub ? 17 : 12), y: node.y - (node.hub ? 17 : 12), width: node.hub ? 34 : 24, height: node.hub ? 34 : 24,
  }));
  const result = new Map<string, { lines: string[]; dx: number; dy: number }>();
  const ordered = [...nodes].sort((a, b) =>
    Number(Boolean(b.hub)) - Number(Boolean(a.hub)) || Number(b.pinned) - Number(a.pinned) || (b.shortLabel ?? b.label).length - (a.shortLabel ?? a.label).length
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );

  for (const node of ordered) {
    const lines = wrapLabel(node.shortLabel ?? node.label, width < 400 ? 18 : 22);
    // Reserve enough room for the larger labels used on narrow screens.
    const labelWidth = Math.max(...lines.map((line) => line.length)) * (node.hub ? 10 : 8.4) + 8;
    const labelHeight = lines.length * (node.hub ? 20 : 16);
    const gap = node.hub ? 22 : 15;
    const candidates = [
      [node.x - labelWidth / 2, node.y + gap],
      [node.x - labelWidth / 2, node.y - gap - labelHeight],
      [node.x + 17, node.y - labelHeight / 2],
      [node.x - 17 - labelWidth, node.y - labelHeight / 2],
      [node.x + 14, node.y + 14],
      [node.x - 14 - labelWidth, node.y + 14],
      [node.x + 14, node.y - 14 - labelHeight],
      [node.x - 14 - labelWidth, node.y - 14 - labelHeight],
    ].map(([x, y], preference) => {
      const box = {
        x: Math.max(4, Math.min(width - labelWidth - 4, x)),
        y: Math.max(4, Math.min(height - labelHeight - 4, y)),
        width: labelWidth,
        height: labelHeight,
      };
      const crossings = edges.filter((edge) => {
        const a = positions.get(edge.s), b = positions.get(edge.t);
        if (!a || !b) return false;
        // Clip the edge to the label rectangle to avoid putting text over a line.
        let min = 0, max = 1;
        for (const [start, delta, low, high] of [[a.x, b.x - a.x, box.x, box.x + box.width], [a.y, b.y - a.y, box.y, box.y + box.height]]) {
          if (delta === 0) { if (start < low || start > high) return false; }
          else { const lo = (low - start) / delta, hi = (high - start) / delta; min = Math.max(min, Math.min(lo, hi)); max = Math.min(max, Math.max(lo, hi)); }
        }
        return min <= max;
      }).length;
      const score = occupied.reduce((sum, other) => sum + overlap(box, other), 0) * 100 + crossings * 0.2 + preference;
      return { box, score };
    });
    candidates.sort((a, b) => a.score - b.score);
    const { box } = candidates[0];
    occupied.push(box);
    result.set(node.id, {
      lines,
      dx: box.x + 4 - node.x,
      dy: box.y + 12 - node.y,
    });
  }
  return result;
}
