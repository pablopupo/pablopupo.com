const stopWords = new Set([
  "a", "an", "and", "are", "at", "about", "by", "for", "from", "in", "is",
  "me", "of", "on", "or", "show", "the", "to", "with", "find",
]);

// Keep equivalents small and specific to the site's subjects. These expand
// vocabulary without turning a broad query into unrelated partial matches.
const equivalents = [
  ["recording", "recordings", "performance", "performances", "recital", "recitals"],
  ["piano", "pianist", "pianists"],
  ["composition", "compositions", "composing", "compose"],
  ["payment", "payments", "pay"],
  ["document", "documents"],
  ["score", "scores", "notation"],
  ["project", "projects"],
  ["note", "notes", "essay", "essays", "post", "posts", "writing"],
];
const canonicalWords = new Map(equivalents.flatMap(([canonical, ...words]) =>
  words.map((word) => [word, canonical] as const)
));

// Related subjects are weaker than a literal match, not interchangeable words.
const relatedWords: Record<string, string[]> = {
  ai: ["rag", "retrieval", "llm", "llms", "embeddings", "machinelearning"],
  rag: ["retrieval"],
  coding: ["software", "engineering", "programming"],
  software: ["engineering", "programming"],
};

function words(value: string) {
  const normalized = value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/\bartificial intelligence\b/g, "ai")
    .replace(/\bmachine learning\b/g, "machinelearning")
    .replace(/\btext[- ]to[- ]speech\b/g, "tts")
    .replace(/\bopen[- ]source\b/g, "opensource");
  return (normalized.match(/[\p{L}\p{N}]+[+#]*/gu) ?? [])
    .map((word) => canonicalWords.get(word) ?? word);
}

function withinEditDistance(left: string, right: string, limit: number) {
  if (Math.abs(left.length - right.length) > limit) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  let beforePrevious = previous;
  for (let row = 1; row <= left.length; row++) {
    const current = [row];
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      // Adjacent swapped letters count as one typo, e.g. "retreival".
      if (row > 1 && column > 1 && left[row - 1] === right[column - 2] && left[row - 2] === right[column - 1]) {
        current[column] = Math.min(current[column], beforePrevious[column - 2] + 1);
      }
    }
    if (Math.min(...current) > limit) return false;
    beforePrevious = previous;
    previous = current;
  }
  return previous[right.length] <= limit;
}

function wordMatch(query: string, candidates: Set<string>) {
  if (candidates.has(query)) return 1;
  if (query.length >= 3 && [...candidates].some((word) => word.startsWith(query))) return 0.8;
  if (relatedWords[query]?.some((word) => candidates.has(word))) return 0.45;
  // Short acronyms need to stay precise: "AI" must not match "at" or "UI".
  if (query.length < 4 || !/^[a-z]+$/.test(query)) return 0;
  const distance = query.length >= 8 ? 2 : 1;
  return [...candidates].some((word) => withinEditDistance(query, word, distance)) ? 0.5 : 0;
}

export function scoreSearchMatch(query: string, title: string, summary: string, metadata: string, body: string) {
  const queryWords = words(query).filter((word) => !stopWords.has(word));
  if (!queryWords.length) return undefined;
  const titleWords = words(title);
  const fields = [titleWords, words(metadata), words(summary), words(body)].map((tokens) => new Set(tokens));
  // Accept joined names such as "KitAI" as well as "Kit AI" or "Kit-AI".
  for (let index = 1; index < titleWords.length; index++) {
    fields[0].add(titleWords[index - 1] + titleWords[index]);
  }
  const weights = [24, 12, 8, 2];
  let score = 0;
  for (const token of new Set(queryWords)) {
    const matches = fields.map((field) => wordMatch(token, field));
    if (!matches.some(Boolean)) return undefined;
    score += Math.max(...matches.map((strength, index) => strength * weights[index]));
  }
  const phrase = queryWords.join(" ");
  const titlePhrase = titleWords.filter((word) => !stopWords.has(word)).join(" ");
  if (titlePhrase.replaceAll(" ", "") === phrase.replaceAll(" ", "")) score += 120;
  else if (titlePhrase.startsWith(phrase)) score += 60;
  else if (titlePhrase.includes(phrase)) score += 40;
  return score;
}
