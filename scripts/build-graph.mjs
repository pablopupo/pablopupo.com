import fs from "fs";
import path from "path";

const root = process.cwd();
const source = JSON.parse(fs.readFileSync(path.join(root, "data", "graph.json"), "utf8"));

const STOPWORDS = new Set(
  `a an and are as at be but by for from has have in is it its of on or that the
   this to was were will with the their them then they those through over under
   into out not no yes his her him she he we our you your one two three new
   also more most other some such only own same so than too very can just
   does did done doing what when where which while who whom why how all any
   both each few once here there again against about above below between
   because before after during without within along across behind beyond
   keeps keep working works with zero like way its`
    .split(/\s+/)
    .filter(Boolean)
);

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

function frontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { data: {}, body: raw };
  const data = {};
  for (const line of match[1].split("\n")) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim().replace(/^["']|["']$/g, "");
    if (value.startsWith("[")) {
      value = value
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
    }
    data[kv[1]] = value;
  }
  return { data, body: raw.slice(match[0].length) };
}

function readPosts() {
  const dir = path.join(root, "content", "posts");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".mdx"))
    .map((f) => {
      const raw = fs.readFileSync(path.join(dir, f), "utf8");
      const { data, body } = frontmatter(raw);
      const wikilinks = [...body.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]/g)].map((m) =>
        m[1].trim().toLowerCase().replace(/\s+/g, "-")
      );
      return {
        id: f.replace(/\.mdx$/, ""),
        label: data.title || f.replace(/\.mdx$/, ""),
        type: "writing",
        href: `/writing/${f.replace(/\.mdx$/, "")}`,
        text: `${data.title || ""} ${data.description || ""} ${body.slice(0, 2000)}`,
        tags: Array.isArray(data.tags) ? data.tags : [],
        wikilinks,
        draft: data.draft === true || data.draft === "true",
      };
    })
    .filter((p) => !p.draft);
}

const posts = readPosts();
const concepts = source.concepts.map((c) => ({ ...c, type: "concept", href: null, tags: [] }));
const docs = [...source.nodes, ...posts, ...concepts];

const byId = new Map(docs.map((d) => [d.id, d]));
const edges = [];
const connected = new Set();

function addEdge(s, t, kind, terms) {
  if (s === t || !byId.has(s) || !byId.has(t)) return;
  const key = [s, t].sort().join("~");
  if (connected.has(key)) return;
  connected.add(key);
  edges.push(terms ? { s, t, kind, terms } : { s, t, kind });
}

for (const doc of docs) {
  for (const tag of doc.tags || []) addEdge(doc.id, tag, "tag");
  for (const link of doc.wikilinks || []) addEdge(doc.id, link, "link");
}

const vocab = new Map();
const tokenized = docs.map((d) => tokenize(`${d.label} ${d.text}`));
for (const tokens of tokenized) {
  for (const t of new Set(tokens)) vocab.set(t, (vocab.get(t) || 0) + 1);
}
const n = docs.length;
const vectors = tokenized.map((tokens) => {
  const tf = new Map();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  const vec = new Map();
  let norm = 0;
  for (const [t, count] of tf) {
    const idf = Math.log(n / (1 + vocab.get(t)));
    if (idf <= 0) continue;
    const w = (count / tokens.length) * idf;
    vec.set(t, w);
    norm += w * w;
  }
  norm = Math.sqrt(norm) || 1;
  for (const [t, w] of vec) vec.set(t, w / norm);
  return vec;
});

function cosine(a, b) {
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  const shared = [];
  for (const [t, w] of small) {
    const w2 = large.get(t);
    if (w2) {
      dot += w * w2;
      shared.push([t, Math.min(w, w2)]);
    }
  }
  shared.sort((x, y) => y[1] - x[1]);
  return { score: dot, terms: shared.slice(0, 3).map(([t]) => t) };
}

function tagAdjacent(a, b) {
  const tagsA = a.tags || [];
  const tagsB = b.tags || [];
  if (tagsA.includes(b.id) || tagsB.includes(a.id)) return true;
  return tagsA.some((t) => tagsB.includes(t));
}

const candidates = [];
for (let i = 0; i < docs.length; i++) {
  for (let j = i + 1; j < docs.length; j++) {
    if (docs[i].type === "concept" && docs[j].type === "concept") continue;
    if (tagAdjacent(docs[i], docs[j])) continue;
    const { score, terms } = cosine(vectors[i], vectors[j]);
    if (score >= 0.07) candidates.push({ i, j, score, terms });
  }
}
candidates.sort((a, b) => b.score - a.score);
const semanticDegree = new Map();
for (const { i, j, terms } of candidates) {
  const a = docs[i].id;
  const b = docs[j].id;
  if ((semanticDegree.get(a) || 0) >= 2 || (semanticDegree.get(b) || 0) >= 2) continue;
  const key = [a, b].sort().join("~");
  if (connected.has(key)) continue;
  addEdge(a, b, "semantic", terms);
  semanticDegree.set(a, (semanticDegree.get(a) || 0) + 1);
  semanticDegree.set(b, (semanticDegree.get(b) || 0) + 1);
}

const degree = new Map();
for (const e of edges) {
  degree.set(e.s, (degree.get(e.s) || 0) + 1);
  degree.set(e.t, (degree.get(e.t) || 0) + 1);
}

const out = {
  nodes: docs
    .filter((d) => d.type !== "concept" || (degree.get(d.id) || 0) > 0)
    .map((d) => ({
      id: d.id,
      label: d.label,
      type: d.type,
      href: d.href || null,
      deg: degree.get(d.id) || 0,
    })),
  edges,
};

fs.writeFileSync(path.join(root, "data", "graph.generated.json"), JSON.stringify(out, null, 1));
console.log(
  `graph: ${out.nodes.length} nodes, ${edges.length} edges (${edges.filter((e) => e.kind === "semantic").length} semantic)`
);
