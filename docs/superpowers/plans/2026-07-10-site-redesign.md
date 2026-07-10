# pablopupo.com Redesign and Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh pablopupo.com's palette and type, add a live contributions page tied to GitHub, expand the knowledge graph, and add a git-backed browser publishing flow.

**Architecture:** The site stays a statically generated Next.js App Router app. Contributions live in a JSON data file reconciled against the GitHub REST API with ISR revalidation. Publishing commits MDX to the GitHub repo through the contents API from a password-protected /admin route; Vercel's git integration redeploys.

**Tech Stack:** Next.js 16, React 19, TypeScript, next-mdx-remote, gray-matter, d3-force, vitest (new, dev only), marked (new, admin preview only).

## Global Constraints

- No em-dashes anywhere: code, comments, commit messages, docs, UI copy, error strings.
- No mid-sentence colons in prose copy.
- All user-facing copy reads as Pablo's writing. Nothing templated or generated-sounding.
- No status badges or pills. Status is carried by section headers.
- Palette is white/black/blue light, near-black dark. No colors outside black, white, blue, gray.
- Commit messages match repo history style: plain imperative sentence, capitalized, no type prefix (e.g. "Add knowledge graph to the homepage").
- Never push to any remote without explicit permission from Pablo.
- Working directory for every command: `/Users/pablopupo/Desktop/Pablo Pupo/pablopupo.com`
- `npm run build` must be green before every commit (it runs the graph prebuild).

---

### Task 1: Palette and type scale refresh

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: nothing
- Produces: CSS custom properties consumed by all later UI tasks. New classes `.posts .meta`, `.posts .excerpt`, `.more` used by Tasks 3 and 6.

- [ ] **Step 1: Update the palette variables**

In `app/globals.css`, replace the two variable blocks:

```css
:root {
  --bg: #ffffff;
  --ink: #111111;
  --muted: #6b6b6b;
  --accent: #2545c8;
  --hairline: #e7e7e7;
  --code-bg: #f5f5f5;
  --mono: ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas,
    "Liberation Mono", monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #101010;
    --ink: #ececec;
    --muted: #969696;
    --accent: #93a8f7;
    --hairline: #262626;
    --code-bg: #1b1b1b;
  }
}
```

- [ ] **Step 2: Scale up the type**

Same file, change these existing declarations (values only, selectors stay):

```css
body { font-size: 1.1875rem; }          /* was 1.125rem */
h1 { font-size: 2rem; }                 /* was 1.625rem */
.intro { font-size: 1.25rem; }          /* was 1.1875rem */
header nav a.wordmark { font-size: 1.125rem; }  /* was 1.0625rem */
.oss-title { font-size: 1.5rem; }       /* was 1.375rem */
.project h2 { font-size: 1.25rem; }     /* was 1.1875rem */
article h2 { font-size: 1.375rem; }     /* was 1.25rem */
article h3 { font-size: 1.1875rem; }    /* was 1.125rem */
```

- [ ] **Step 3: Add list metadata styles for later tasks**

Append to `app/globals.css` after the `.posts time` rule:

```css
.posts .meta {
  font-family: var(--mono);
  font-size: 0.8125rem;
  color: var(--muted);
  white-space: nowrap;
}

.posts .excerpt {
  color: var(--muted);
  font-size: 1rem;
  margin-top: 0.125rem;
}

.more {
  font-family: var(--mono);
  font-size: 0.8125rem;
  margin-top: 0.75rem;
}

.more a {
  color: var(--muted);
}

.more a:hover {
  color: var(--accent);
}
```

Also change `.posts li` to stack title and metadata:

```css
.posts li {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding-block: 0.75rem;
}

.posts .head {
  display: flex;
  align-items: baseline;
  gap: 1rem;
}
```

(The `@media (max-width: 480px)` block's `.posts li` override becomes redundant; delete it.)

- [ ] **Step 4: Verify and commit**

Run: `npm install && npm run build`
Expected: build succeeds, graph prebuild prints node/edge counts.

Run: `npm run dev` and load http://localhost:3000 in light and dark mode. White background, black ink, blue links; near-black dark mode. Type visibly larger.

```bash
git add app/globals.css
git commit -m "Move palette to white, black, and blue and scale up type"
```

---

### Task 2: Contributions data and library

**Files:**
- Create: `data/contributions.json`
- Create: `lib/contributions.ts`
- Create: `lib/contributions.test.ts`
- Create: `vitest.config.ts`
- Modify: `package.json` (test script, vitest devDependency)

**Interfaces:**
- Consumes: nothing
- Produces: `type Contribution = { repo: string; pr: number; url: string; title: string; date: string; status: "merged" | "open" | "closed"; writeup?: string }`, `getContributions(): Contribution[]` (sorted newest first), `groupByStatus(list: Contribution[]): Record<"merged" | "open" | "closed", Contribution[]>`, `shortRef(c: Contribution): string` (e.g. "docling #3722"). Task 3 and Task 4 import all of these from `@/lib/contributions`.

- [ ] **Step 1: Install vitest and add the test script**

```bash
npm install -D vitest
```

In `package.json` scripts add: `"test": "vitest run"`.

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
});
```

- [ ] **Step 2: Seed the data file**

Create `data/contributions.json`. One record per row of
`/Users/pablopupo/Desktop/Pablo Pupo/OSS/CONTRIBUTIONS.md` that has a PR link.
Rows without a PR (leads and claims) are excluded. Map each row: `repo` is the
upstream repo path, `pr` the PR number, `url` the PR URL, `title` a one-line
description condensed from the row in Pablo's words (reuse the row's own
phrasing, shortened; no em-dashes), `date` the filed or merged date from the
row, `status` merged/open/closed per the row. `writeup` omitted for now.
Format examples covering each status:

```json
[
  {
    "repo": "docling-project/docling",
    "pr": 3722,
    "url": "https://github.com/docling-project/docling/pull/3722",
    "title": "new BoxNote document backend",
    "date": "2026-07-07",
    "status": "merged"
  },
  {
    "repo": "vllm-project/vllm",
    "pr": 48157,
    "url": "https://github.com/vllm-project/vllm/pull/48157",
    "title": "composed tool-call and response-format grammar for structured outputs",
    "date": "2026-07-09",
    "status": "open"
  },
  {
    "repo": "openai/openai-agents-python",
    "pr": 3728,
    "url": "https://github.com/openai/openai-agents-python/pull/3728",
    "title": "retry hook for invalid structured output, maintainer adopted the same design",
    "date": "2026-07-02",
    "status": "closed"
  }
]
```

- [ ] **Step 3: Write the failing test**

Create `lib/contributions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { groupByStatus, shortRef, type Contribution } from "./contributions";

const c = (over: Partial<Contribution>): Contribution => ({
  repo: "docling-project/docling",
  pr: 1,
  url: "https://github.com/docling-project/docling/pull/1",
  title: "t",
  date: "2026-07-01",
  status: "open",
  ...over,
});

describe("groupByStatus", () => {
  it("groups into merged, open, closed keeping order", () => {
    const list = [
      c({ pr: 3, status: "merged" }),
      c({ pr: 2, status: "open" }),
      c({ pr: 1, status: "closed" }),
      c({ pr: 4, status: "merged" }),
    ];
    const g = groupByStatus(list);
    expect(g.merged.map((x) => x.pr)).toEqual([3, 4]);
    expect(g.open.map((x) => x.pr)).toEqual([2]);
    expect(g.closed.map((x) => x.pr)).toEqual([1]);
  });
});

describe("shortRef", () => {
  it("uses the repo name after the slash", () => {
    expect(shortRef(c({ repo: "vllm-project/vllm", pr: 48157 }))).toBe(
      "vllm #48157"
    );
    expect(
      shortRef(c({ repo: "modelcontextprotocol/typescript-sdk", pr: 2418 }))
    ).toBe("typescript-sdk #2418");
  });
});
```

Run: `npm test`
Expected: FAIL, module `./contributions` not found.

- [ ] **Step 4: Implement the library**

Create `lib/contributions.ts`:

```ts
import fs from "fs";
import path from "path";

export type ContributionStatus = "merged" | "open" | "closed";

export type Contribution = {
  repo: string;
  pr: number;
  url: string;
  title: string;
  date: string;
  status: ContributionStatus;
  writeup?: string;
};

const dataFile = path.join(process.cwd(), "data", "contributions.json");

export function getContributions(): Contribution[] {
  const raw = fs.readFileSync(dataFile, "utf8");
  const list = JSON.parse(raw) as Contribution[];
  return list.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function groupByStatus(
  list: Contribution[]
): Record<ContributionStatus, Contribution[]> {
  const groups: Record<ContributionStatus, Contribution[]> = {
    merged: [],
    open: [],
    closed: [],
  };
  for (const c of list) groups[c.status].push(c);
  return groups;
}

export function shortRef(c: Contribution): string {
  return `${c.repo.split("/")[1]} #${c.pr}`;
}
```

- [ ] **Step 5: Run tests, then commit**

Run: `npm test`
Expected: PASS (3 tests).

```bash
git add data/contributions.json lib/contributions.ts lib/contributions.test.ts vitest.config.ts package.json package-lock.json
git commit -m "Add contributions data and library"
```

---

### Task 3: Contributions page, nav, home and projects rewiring

**Files:**
- Create: `app/contributions/page.tsx`
- Modify: `app/nav.tsx`
- Modify: `app/page.tsx`
- Modify: `app/projects/page.tsx`
- Modify: `app/sitemap.ts`

**Interfaces:**
- Consumes: `getContributions`, `groupByStatus`, `shortRef` from `@/lib/contributions` (Task 2)
- Produces: route `/contributions`. Task 4 modifies `app/contributions/page.tsx` to use live data.

- [ ] **Step 1: Create the contributions page**

Create `app/contributions/page.tsx`:

```tsx
import type { Metadata } from "next";
import { getContributions, groupByStatus, shortRef } from "@/lib/contributions";

export const metadata: Metadata = {
  title: "Contributions",
};

const SECTIONS = [
  ["merged", "Merged"],
  ["open", "In review"],
  ["closed", "Closed"],
] as const;

export default function Contributions() {
  const groups = groupByStatus(getContributions());

  return (
    <>
      <h1>Open source contributions</h1>
      <p>
        Everything I have shipped or have in flight across the LLM serving and
        document intelligence stack, as GitHub user{" "}
        <a href="https://github.com/pablopupo">pablopupo</a>.
      </p>
      {SECTIONS.map(([key, label]) =>
        groups[key].length > 0 ? (
          <section key={key}>
            <h2 className="label">{label}</h2>
            <ul className="prs">
              {groups[key].map((c) => (
                <li key={c.url}>
                  <a className="id" href={c.url}>
                    {shortRef(c)}
                  </a>
                  <span className="desc">{c.title}</span>
                  {c.writeup && (
                    <a className="writeup" href={`/writing/${c.writeup}`}>
                      writeup
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null
      )}
    </>
  );
}
```

Add the writeup link style to `app/globals.css` after the `.prs .desc` rule:

```css
.prs .writeup {
  font-family: var(--mono);
  font-size: 0.75rem;
  color: var(--muted);
  margin-left: 0.5rem;
}
```

- [ ] **Step 2: Add contributions to the nav**

In `app/nav.tsx` change the links array:

```tsx
const links = [
  ["/projects", "Projects"],
  ["/contributions", "Contributions"],
  ["/writing", "Writing"],
  ["/about", "About"],
] as const;
```

- [ ] **Step 3: Wire home to the data**

In `app/page.tsx`, replace the hardcoded "Recent open source" `<ul className="prs">` block with data-driven markup. Add imports and render the three most recent, plus the count link:

```tsx
import { getContributions, shortRef } from "@/lib/contributions";
```

```tsx
<h2 className="label">Recent open source</h2>
<ul className="prs">
  {getContributions()
    .slice(0, 3)
    .map((c) => (
      <li key={c.url}>
        <a className="id" href={c.url}>
          {shortRef(c)}
        </a>
        <span className="desc">{c.title}</span>
      </li>
    ))}
</ul>
<p className="more">
  <a href="/contributions">all {getContributions().length} contributions</a>
</p>
```

Store `const contributions = getContributions();` once at the top of the component and reuse it for both the slice and the count.

- [ ] **Step 4: Remove the OSS section from projects**

In `app/projects/page.tsx`, delete the entire `<section className="oss" id="open-source">` block. Everything in it now lives at /contributions.

- [ ] **Step 5: Add the route to the sitemap**

In `app/sitemap.ts`, add a `/contributions` entry alongside the existing static routes, same shape as the `/projects` entry.

- [ ] **Step 6: Verify and commit**

Run: `npm run build`
Expected: green, `/contributions` in the route list.

Visual check on dev server: nav shows Contributions, home lists 3 with the count link, projects page has no OSS section.

```bash
git add app/contributions/page.tsx app/nav.tsx app/page.tsx app/projects/page.tsx app/sitemap.ts app/globals.css
git commit -m "Add contributions page and wire home to contribution data"
```

---

### Task 4: Live status from the GitHub API

**Files:**
- Create: `lib/github-status.ts`
- Create: `lib/github-status.test.ts`
- Modify: `app/contributions/page.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `Contribution`, `ContributionStatus`, `getContributions` from `@/lib/contributions`
- Produces: `reconcile(c: Contribution, pr: PrState | null): Contribution`, `getLiveContributions(): Promise<Contribution[]>`, `type PrState = { state: "open" | "closed"; merged: boolean }`. Pages call `getLiveContributions()` instead of `getContributions()`.

- [ ] **Step 1: Write the failing test**

Create `lib/github-status.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { reconcile, type PrState } from "./github-status";
import type { Contribution } from "./contributions";

const base: Contribution = {
  repo: "docling-project/docling",
  pr: 3753,
  url: "https://github.com/docling-project/docling/pull/3753",
  title: "orphaned table text recovery",
  date: "2026-07-04",
  status: "open",
};

describe("reconcile", () => {
  it("marks merged PRs merged", () => {
    const pr: PrState = { state: "closed", merged: true };
    expect(reconcile(base, pr).status).toBe("merged");
  });

  it("marks closed unmerged PRs closed", () => {
    const pr: PrState = { state: "closed", merged: false };
    expect(reconcile(base, pr).status).toBe("closed");
  });

  it("keeps open PRs open", () => {
    const pr: PrState = { state: "open", merged: false };
    expect(reconcile(base, pr).status).toBe("open");
  });

  it("falls back to the stored status when the fetch failed", () => {
    expect(reconcile(base, null).status).toBe("open");
  });
});
```

Run: `npm test`
Expected: FAIL, module `./github-status` not found. The Task 2 tests still pass.

- [ ] **Step 2: Implement**

Create `lib/github-status.ts`:

```ts
import {
  getContributions,
  type Contribution,
  type ContributionStatus,
} from "./contributions";

export type PrState = { state: "open" | "closed"; merged: boolean };

const REVALIDATE_SECONDS = 21600;

export function reconcile(c: Contribution, pr: PrState | null): Contribution {
  if (!pr) return c;
  const status: ContributionStatus = pr.merged
    ? "merged"
    : pr.state === "closed"
      ? "closed"
      : "open";
  return { ...c, status };
}

async function fetchPrState(c: Contribution): Promise<PrState | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${c.repo}/pulls/${c.pr}`,
      { headers, next: { revalidate: REVALIDATE_SECONDS } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { state: string; merged: boolean };
    return {
      state: body.state === "open" ? "open" : "closed",
      merged: body.merged === true,
    };
  } catch {
    return null;
  }
}

export async function getLiveContributions(): Promise<Contribution[]> {
  const stored = getContributions();
  const states = await Promise.all(stored.map(fetchPrState));
  return stored.map((c, i) => reconcile(c, states[i]));
}
```

Run: `npm test`
Expected: PASS (7 tests total).

- [ ] **Step 3: Use live data in the pages**

In `app/contributions/page.tsx` and `app/page.tsx`:
- Replace `getContributions` imports with `getLiveContributions` from `@/lib/github-status` (keep `shortRef`/`groupByStatus` imports from `@/lib/contributions`).
- Make the components `async function` and `const contributions = await getLiveContributions();`.
- Add `export const revalidate = 21600;` to both files.

- [ ] **Step 4: Verify and commit**

Run: `npm run build`
Expected: green. During build the fetches run; without a token some may fall back, which is the designed behavior.

Run: `GITHUB_TOKEN=$(gh auth token) npm run dev`, load /contributions, confirm statuses match reality (e.g. docling #3722 under Merged).

```bash
git add lib/github-status.ts lib/github-status.test.ts app/contributions/page.tsx app/page.tsx
git commit -m "Reconcile contribution status against the GitHub API"
```

---

### Task 5: Knowledge graph music type

**Files:**
- Modify: `components/knowledge-graph.tsx`
- Modify: `data/graph.json`

**Interfaces:**
- Consumes: existing graph pipeline (`scripts/build-graph.mjs` passes node `type` through untouched, so no script change needed)
- Produces: `NodeType` union gains `"music"`; graph renders and legends it.

- [ ] **Step 1: Extend the component**

In `components/knowledge-graph.tsx`:
- `type NodeType = "project" | "oss" | "concept" | "writing" | "music";`
- Add `music` entries to `TYPE_LABELS` (label "music") and `TYPE_GLYPHS` (pick the glyph style consistent with the existing entries; read both records first and mirror their format).
- Add `music: 3.8` to the base radius map on the line reading `const base = { project: 4.5, oss: 3.2, concept: 3.4, writing: 4 }[node.type];`.
- In the canvas draw code where `n.type === "writing"` gets its own branch, add a `music` branch drawing a diamond: a square rotated 45 degrees, filled with the ink color. Follow the exact drawing idiom of the adjacent branches (same ctx calls pattern, same dim/alpha handling).
- Colors must come from the existing theme values (ink, accent, muted). No new hues.

- [ ] **Step 2: Seed music data honestly**

In `data/graph.json`, add one music node only (do not invent performances; Pablo adds his own repertoire later):

```json
{
  "id": "chopin-etudes",
  "label": "Chopin Etudes",
  "type": "music",
  "href": null,
  "text": "Chopin Etudes, the first corpus for gradus-ad-parnassum and core repertoire. Piano performance and practice.",
  "tags": ["piano", "music", "notation"]
}
```

- [ ] **Step 3: Verify and commit**

Run: `npm run build`
Expected: graph prebuild prints one more node; build green.

Visual check: legend shows music; the Chopin Etudes diamond connects near gradus-ad-parnassum.

```bash
git add components/knowledge-graph.tsx data/graph.json
git commit -m "Add a music node type to the knowledge graph"
```

---

### Task 6: Writing page metadata

**Files:**
- Modify: `lib/posts.ts`
- Create: `lib/posts.test.ts`
- Modify: `app/writing/page.tsx`

**Interfaces:**
- Consumes: existing `Post` type and `getPosts()`
- Produces: `Post` gains `readMinutes: number`; `readingTime(content: string): number` exported for tests. Writing page renders date, read time, excerpt.

- [ ] **Step 1: Write the failing test**

Create `lib/posts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readingTime } from "./posts";

describe("readingTime", () => {
  it("rounds up at 230 words per minute with a 1 minute floor", () => {
    expect(readingTime("word")).toBe(1);
    expect(readingTime(Array(231).fill("word").join(" "))).toBe(2);
    expect(readingTime(Array(460).fill("word").join(" "))).toBe(2);
  });
});
```

Run: `npm test`
Expected: FAIL, `readingTime` is not exported.

- [ ] **Step 2: Implement**

In `lib/posts.ts` add to the `Post` type: `readMinutes: number;` and export:

```ts
export function readingTime(content: string): number {
  const words = content.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 230));
}
```

In `readPost`, add `readMinutes: readingTime(content),` to the returned object.

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Render it on the writing page**

In `app/writing/page.tsx` replace the `<li>` body:

```tsx
<li key={post.slug}>
  <div className="head">
    <Link href={`/writing/${post.slug}`}>{post.title}</Link>
  </div>
  <span className="meta">
    <time dateTime={post.date}>{formatDate(post.date)}</time>
    {" · "}
    {post.readMinutes} min read
  </span>
  {post.description && <p className="excerpt">{post.description}</p>}
</li>
```

Also render the read time under the title in `app/writing/[slug]/page.tsx` by extending the existing `<time>` line:

```tsx
<time dateTime={post.date}>
  {formatDate(post.date)} · {post.readMinutes} min read
</time>
```

- [ ] **Step 4: Verify and commit**

Run: `npm run build`
Expected: green. (The only post is a draft, so the list is empty; temporarily flip its flag on the dev server to eyeball the layout, then flip it back.)

```bash
git add lib/posts.ts lib/posts.test.ts app/writing/page.tsx "app/writing/[slug]/page.tsx"
git commit -m "Add read time and excerpts to the writing page"
```

---

### Task 7: Admin session auth

**Files:**
- Create: `lib/admin-session.ts`
- Create: `lib/admin-session.test.ts`
- Create: `app/api/admin/login/route.ts`
- Create: `.env.local` (never committed; already covered by .gitignore's `.env*`, verify)

**Interfaces:**
- Consumes: env vars `ADMIN_PASSWORD`, `SESSION_SECRET`
- Produces: `createSessionToken(secret: string, ttlMs: number): string`, `verifySessionToken(token: string, secret: string): boolean`, cookie name constant `SESSION_COOKIE = "admin_session"`, and `requireSession(req: Request): boolean` helper used by Task 8's routes. POST `/api/admin/login` with `{ password }` sets the cookie.

- [ ] **Step 1: Write the failing test**

Create `lib/admin-session.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { createSessionToken, verifySessionToken } from "./admin-session";

const SECRET = "test-secret";

describe("session tokens", () => {
  it("round-trips a valid token", () => {
    const token = createSessionToken(SECRET, 60_000);
    expect(verifySessionToken(token, SECRET)).toBe(true);
  });

  it("rejects a tampered token", () => {
    const token = createSessionToken(SECRET, 60_000);
    expect(verifySessionToken(token + "x", SECRET)).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const token = createSessionToken(SECRET, 60_000);
    expect(verifySessionToken(token, "other")).toBe(false);
  });

  it("rejects an expired token", () => {
    const token = createSessionToken(SECRET, -1);
    expect(verifySessionToken(token, SECRET)).toBe(false);
  });

  it("rejects garbage", () => {
    expect(verifySessionToken("not-a-token", SECRET)).toBe(false);
  });
});
```

Run: `npm test`
Expected: FAIL, module not found.

- [ ] **Step 2: Implement the token functions**

Create `lib/admin-session.ts`:

```ts
import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "admin_session";

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function createSessionToken(secret: string, ttlMs: number): string {
  const expires = Date.now() + ttlMs;
  return `${expires}.${sign(String(expires), secret)}`;
}

export function verifySessionToken(token: string, secret: string): boolean {
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const expires = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  const expected = sign(expires, secret);
  if (mac.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

export function requireSession(req: Request): boolean {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return false;
  const cookies = req.headers.get("cookie") ?? "";
  const match = cookies.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? verifySessionToken(match[1], secret) : false;
}
```

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Login route**

Create `app/api/admin/login/route.ts`:

```ts
import { timingSafeEqual } from "crypto";
import { createSessionToken, SESSION_COOKIE } from "@/lib/admin-session";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(req: Request) {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password || !secret) {
    return Response.json({ error: "admin not configured" }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as {
    password?: string;
  } | null;
  if (!body?.password || !safeEqual(body.password, password)) {
    return Response.json({ error: "wrong password" }, { status: 401 });
  }
  const token = createSessionToken(secret, SESSION_TTL_MS);
  return new Response(null, {
    status: 204,
    headers: {
      "Set-Cookie": `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`,
    },
  });
}
```

- [ ] **Step 4: Local env**

Verify `.gitignore` covers `.env*`. Create `.env.local` with a strong `ADMIN_PASSWORD` and `SESSION_SECRET` (generate with `openssl rand -hex 32`), plus `GITHUB_TOKEN` left empty for now.

- [ ] **Step 5: Verify and commit**

Run: `npm test && npm run build`
Expected: both green.

Run on dev server:
`curl -s -o /dev/null -w "%{http_code}" -X POST localhost:3000/api/admin/login -H 'content-type: application/json' -d '{"password":"wrong"}'`
Expected: 401. With the right password: 204 with a Set-Cookie header.

```bash
git add lib/admin-session.ts lib/admin-session.test.ts app/api/admin/login/route.ts
git commit -m "Add password login with signed session cookies"
```

---

### Task 8: Admin editor and git-backed publish

**Files:**
- Create: `app/api/admin/posts/route.ts`
- Create: `app/api/admin/publish/route.ts`
- Create: `app/admin/page.tsx`
- Create: `app/admin/editor.tsx`
- Modify: `app/robots.ts`
- Modify: `package.json` (marked dependency)

**Interfaces:**
- Consumes: `requireSession` from `@/lib/admin-session` (Task 7); env vars `GITHUB_TOKEN` (fine-grained PAT, contents read/write on pablopupo/pablopupo.com), `GITHUB_REPO` defaulting to `pablopupo/pablopupo.com`
- Produces: GET `/api/admin/posts` returns `{ posts: { slug, title, date, draft }[] }`; GET `/api/admin/posts?slug=x` returns `{ frontmatter, body }`; POST `/api/admin/publish` with `{ slug, title, date, description, draft, body }` commits `content/posts/<slug>.mdx` and returns `{ commitUrl }`.

- [ ] **Step 1: GitHub-backed post listing route**

```bash
npm install marked
```

Create `app/api/admin/posts/route.ts`:

```ts
import matter from "gray-matter";
import { requireSession } from "@/lib/admin-session";

const REPO = process.env.GITHUB_REPO ?? "pablopupo/pablopupo.com";
const API = "https://api.github.com";

function gh(pathname: string) {
  return fetch(`${API}${pathname}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    },
    cache: "no-store",
  });
}

export async function GET(req: Request) {
  if (!requireSession(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const slug = new URL(req.url).searchParams.get("slug");
  if (slug) {
    const res = await gh(`/repos/${REPO}/contents/content/posts/${slug}.mdx`);
    if (!res.ok) {
      return Response.json({ error: await res.text() }, { status: res.status });
    }
    const file = (await res.json()) as { content: string };
    const raw = Buffer.from(file.content, "base64").toString("utf8");
    const { data, content } = matter(raw);
    return Response.json({ frontmatter: data, body: content });
  }
  const res = await gh(`/repos/${REPO}/contents/content/posts`);
  if (!res.ok) {
    return Response.json({ error: await res.text() }, { status: res.status });
  }
  const files = (await res.json()) as { name: string }[];
  const posts = [];
  for (const f of files.filter((f) => f.name.endsWith(".mdx"))) {
    const one = await gh(`/repos/${REPO}/contents/content/posts/${f.name}`);
    if (!one.ok) continue;
    const file = (await one.json()) as { content: string };
    const { data } = matter(Buffer.from(file.content, "base64").toString("utf8"));
    posts.push({
      slug: f.name.replace(/\.mdx$/, ""),
      title: data.title ?? f.name,
      date: data.date ?? "",
      draft: data.draft === true,
    });
  }
  return Response.json({ posts });
}
```

- [ ] **Step 2: Publish route**

Create `app/api/admin/publish/route.ts`:

```ts
import { requireSession } from "@/lib/admin-session";

const REPO = process.env.GITHUB_REPO ?? "pablopupo/pablopupo.com";
const API = "https://api.github.com";

type PublishBody = {
  slug: string;
  title: string;
  date: string;
  description?: string;
  draft: boolean;
  body: string;
};

function compose(p: PublishBody): string {
  const lines = ["---", `title: ${p.title}`, `date: "${p.date}"`];
  if (p.description) lines.push(`description: ${p.description}`);
  if (p.draft) lines.push("draft: true");
  lines.push("---", "", p.body.trim(), "");
  return lines.join("\n");
}

export async function POST(req: Request) {
  if (!requireSession(req)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.GITHUB_TOKEN) {
    return Response.json({ error: "GITHUB_TOKEN not set" }, { status: 503 });
  }
  const p = (await req.json().catch(() => null)) as PublishBody | null;
  if (!p?.slug || !/^[a-z0-9-]+$/.test(p.slug) || !p.title || !p.date) {
    return Response.json({ error: "slug, title, and date required" }, { status: 400 });
  }
  const path = `content/posts/${p.slug}.mdx`;
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
  };
  const existing = await fetch(`${API}/repos/${REPO}/contents/${path}`, {
    headers,
    cache: "no-store",
  });
  const sha = existing.ok
    ? ((await existing.json()) as { sha: string }).sha
    : undefined;
  const res = await fetch(`${API}/repos/${REPO}/contents/${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: sha ? `Update post ${p.slug}` : `Publish post ${p.slug}`,
      content: Buffer.from(compose(p)).toString("base64"),
      ...(sha ? { sha } : {}),
    }),
  });
  if (!res.ok) {
    return Response.json({ error: await res.text() }, { status: res.status });
  }
  const out = (await res.json()) as { commit: { html_url: string } };
  return Response.json({ commitUrl: out.commit.html_url });
}
```

- [ ] **Step 3: Admin page and editor**

Create `app/admin/page.tsx`:

```tsx
import type { Metadata } from "next";
import Editor from "./editor";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default function Admin() {
  return <Editor />;
}
```

Create `app/admin/editor.tsx` as a client component. Full behavior:

- State: `authed` (starts false, set true after a successful `GET /api/admin/posts` or login), `posts` list, and the current draft fields `slug`, `title`, `date` (default today), `description`, `draft` (default true), `body`, plus `status` for messages.
- Not authed: a single password input and button posting to `/api/admin/login`; 204 sets `authed` and loads the post list; 401 shows "wrong password".
- Authed: a post list (title, date, draft marker) where clicking loads that post through `GET /api/admin/posts?slug=`, a "new post" button that clears the fields, the field inputs, a textarea for the body, and a preview pane rendering `marked.parse(body)` into a sandboxed `<div>` via `dangerouslySetInnerHTML` with a note that MDX components will not render in preview.
- Slug auto-derives from the title (`title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")`) until the slug field is manually edited.
- Publish button posts the fields to `/api/admin/publish`, then shows the returned `commitUrl` as a link, or the error body verbatim.
- Style with the existing site classes plus a small `<style>` block scoped to the page for the two-pane layout. Mono labels, no new colors.

- [ ] **Step 4: Keep crawlers out**

In `app/robots.ts` add to the rules: `disallow: ["/admin", "/api/"]`.

- [ ] **Step 5: Verify end to end locally and commit**

Run: `npm test && npm run build`
Expected: green.

With `GITHUB_TOKEN` still unset, log in on the dev server and confirm publish returns the 503 "GITHUB_TOKEN not set" error in the UI (the designed failure mode). Full end-to-end publish is verified after deploy in Task 9.

```bash
git add app/api/admin app/admin app/robots.ts package.json package-lock.json
git commit -m "Add the admin editor with git-backed publishing"
```

---

### Task 9: Deploy (gated on Pablo)

**Files:** none (operations only)

This task requires Pablo's explicit go-ahead twice: once to push the branch to GitHub, once to deploy.

- [ ] **Step 1: Ask Pablo for permission to push to origin main**
- [ ] **Step 2: After push, deploy to Vercel** (`vercel` CLI or dashboard import of the GitHub repo; project name pablopupo-com)
- [ ] **Step 3: Set env vars in Vercel:** `ADMIN_PASSWORD`, `SESSION_SECRET`, `GITHUB_TOKEN` (fine-grained PAT, contents read/write on pablopupo/pablopupo.com only), optional `GITHUB_REPO`
- [ ] **Step 4: Verify the live site:** all pages, both color schemes, contribution statuses correct
- [ ] **Step 5: Verify admin end to end:** publish a real draft post, confirm the commit lands and Vercel redeploys, then edit it and confirm the update
- [ ] **Step 6: Domain when purchased:** add pablopupo.com in Vercel domains, point DNS

---

### Task 10: Writeup drafts (content, interactive)

**Files:**
- Create: `content/posts/<slug>.mdx` per writeup (drafts, `draft: true`)
- Modify: `data/contributions.json` (writeup slugs)

Drafted from `/Users/pablopupo/Desktop/Pablo Pupo/OSS/contributions/<repo>-<issue>/notes.md` in Pablo's voice. Strong candidates: the docling BoxNote backend (#3722), the vLLM composed grammar pair (#47439 and #48157), the inspect_ai deterministic recovery fix (#4417), the openai-agents closed-but-adopted story (#3728). Each draft goes to Pablo for editing and approval before the draft flag comes off. No AI-sounding prose, no em-dashes, no disclosure lines.

---

## Self-Review

- Spec coverage: palette/type (T1), contributions data and page (T2, T3), live status with ISR and fallback (T4), graph types (T5), read time and excerpts (T6), admin auth (T7), editor and publish (T8), RSS/sitemap/robots (T3 sitemap, T8 robots; RSS needs no change, it already lists all non-draft posts), deploy and domain (T9), writeups (T10). Home auto-count covered in T3.
- Placeholders: none; every code step has complete code. T8 step 3 describes UI behavior exhaustively rather than dumping 200 lines of JSX; every field, endpoint, and state transition is named.
- Type consistency: `Contribution`, `PrState`, `requireSession`, `SESSION_COOKIE`, `getLiveContributions` names match across tasks.
