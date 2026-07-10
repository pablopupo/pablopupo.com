# pablopupo.com redesign and publishing backend

Date: 2026-07-10
Status: approved in brainstorming session (four visual rounds plus Q&A)

## Goal

Make pablopupo.com the place recruiters at frontier AI labs land to learn who Pablo
is. Three workstreams: visual and structural refinement, an open source contributions
section tied to github.com/pablopupo, and a browser-based publishing flow.

## Decisions made with Pablo

- Keep the current design system (Newsreader serif body, mono accents, 42rem measure).
- Palette moves from warm beige to white/black/blue in light mode. Dark mode stays
  near-black with the lifted blue that already exists.
- Type scales up one notch: 19px body, larger h1. The steipete.me reference set the
  bar for readability.
- No status badges or pills anywhere. Status is carried by section headers
  (Merged, In review, Closed), the pattern the projects page already uses.
- Post lists show a mono date, read time, and a one-sentence excerpt.
- Knowledge graph gets five node types: project, open source, writing, music,
  concept. Work folds into projects. Shapes differentiate types; colors stay
  black, blue, and gray.
- Publishing is git-backed. No database.
- All copy in Pablo's voice. No em-dashes anywhere. Nothing that reads
  AI-generated. Writeups are drafted from his contribution notes and he edits
  and approves before anything publishes.

## Architecture

The site stays a statically generated Next.js app on Vercel (App Router, MDX via
next-mdx-remote), with ISR revalidation only where noted. Three additions:

### 1. Contributions data and page

- `data/contributions.json` holds one record per contribution: repo, PR number
  and URL, issue, one-line description in Pablo's words, status
  (merged/open/closed/lead), date, optional writeup slug. Seeded from the
  OSS/CONTRIBUTIONS.md table.
- `/contributions` renders the records grouped by status. Statuses are section
  headers, items are the existing `.prs` line style, writeup links are quiet
  mono links.
- Live status refresh: a small module fetches PR state from the GitHub REST API
  and reconciles it with the JSON at build time. A read-only token via env is
  the default; unauthenticated calls from shared build IPs rate-limit too
  easily, and the fallback below covers failures either way. The page uses Next ISR
  (`revalidate`, on the order of hours) so statuses stay current without
  rebuild-on-every-request.
- Home pulls the three most recent contributions from the same data and links
  to the full page with a live count.

### 2. Writing pipeline

- Posts remain MDX files in `content/posts` with the existing draft-flag model.
- Frontmatter gains optional `description` (excerpt) and `pr` (links a writeup
  to a contribution record). Read time computed at build.
- Writing page lists date, title, read time, excerpt. Writeups are ordinary
  posts that contributions link to.

### 3. Admin publishing (git-backed)

- `/admin` is a client-rendered route behind a password set in an env var.
  Login exchanges the password for a signed httpOnly session cookie (an API
  route signs it with a server secret). No accounts, no database.
- The editor is a plain textarea with an MDX preview pane, title and
  description fields, and a draft toggle.
- Publish calls an API route that commits the MDX file to the GitHub repo
  (contents API, fine-grained PAT scoped to this repo, stored as a Vercel env
  var). Vercel's git integration redeploys, so publish latency is one build.
- Editing an existing post loads its file from the repo and commits over it.
- The admin route is noindexed and excluded from the sitemap.

## Page inventory after the work

- `/` home: intro, selected work, recent contributions (auto), graph
- `/contributions` new
- `/writing` improved list; `/writing/[slug]` unchanged rendering, better post CSS
- `/projects` loses its OSS section (moves to /contributions)
- `/about` copy untouched
- `/admin` new, private
- RSS, sitemap, robots updated for the new page and posts

## Graph changes

- `data/graph.json` nodes gain `music` type entries (repertoire, performances)
  and writing nodes appear as posts publish (build script already regenerates
  `graph.generated.json`).
- `TYPE_LABELS`, `TYPE_GLYPHS`, radii, and colors extended for the two new
  types. Colors from the site palette only.

## Error handling

- GitHub status fetch failures fall back to the last JSON state; the page never
  breaks because the API was down or rate limited.
- Admin publish surfaces the GitHub API error body verbatim in the UI; nothing
  retries silently.
- Bad or missing session cookie on any admin API route returns 401 and the UI
  drops back to the login form.

## Testing and verification

- `npm run build` (includes the graph prebuild) green locally before any commit.
- Contribution status reconciliation covered by a small unit test with fixture
  API payloads.
- Admin flow verified end to end against the real repo once deployed (draft
  post, then a publish, then an edit).
- Visual pass in both color schemes at 42rem and mobile width.

## Sequencing

1. Palette and type scale refresh, post list CSS
2. Contributions data file seeded, /contributions page, home wired to it
3. GitHub status refresh with ISR
4. Graph node types and data
5. Writing page metadata (read time, excerpts)
6. Admin auth, editor, publish route
7. Vercel deploy, then domain when purchased
8. Writeup drafts from contribution notes, published only after Pablo edits

## Out of scope

- No database, no CMS dependency, no analytics decision yet
- No public-facing AI-assistance disclosure anywhere on the site
- Nothing pushes to GitHub without explicit permission per OSS/CLAUDE.md
