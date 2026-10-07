# pablopupo.com

Pablo Pupo’s personal site for AI and software engineering, classical piano, Accordo, and writing.

## Local preview

```sh
npm install
npm run dev -- --hostname 127.0.0.1 --port 3100
```

Open http://127.0.0.1:3100. The public site works without credentials, using local content. The homepage introduces Pablo and both career paths, then shows the interactive graph with nothing selected. Engineering and Music are larger starting points, joined through Accordo and other shared work. Visitors can select and drag points, or use the keyboard to explore. Selecting a recording shows an inline video player; playback starts only when the visitor presses play.

The homepage map is titled **The map**, with a key for projects (circles), topics (open circles), music (diamonds), and writing (squares). Its Obsidian-inspired force layout forms natural clusters from the connections, with extra space between points and visible labels. The default layout follows Pablo’s September 18 reference: Engineering on the left, Music on the right, Accordo between them, and smaller branches spread around the outside. Known entries have curated starting positions, matched by public path or topic name rather than database ID. New entries settle around those positions. On phones the same branches use a taller arrangement. Dragging remains free and lets the surrounding network respond and settle. Reduced-motion preferences disable that secondary movement. Edge colors have dedicated light and dark values so connections remain visible without dominating the labels. Music essays use the writing symbol. On phones the map sits above the detail panel. The graph editor retains its existing force settings.

The development-only `/design-preview` page compares three hub appearances and three recording layouts using the current public content. Changes there are temporary previews. The homepage uses open circles and a smaller player beside the recording details. The preview route returns 404 in production. Recording editing is available in Studio, with no edit links on public pages.

Page navigation uses native React view transitions: a 440ms horizontal page slide, shared writing/project/recording titles, and a moving navigation underline. The header stays steady and whole pages do not stretch to match their different heights. The direction follows the routes actually committed, so rapid clicks that merge or omit link transition types still slide consistently. Public Markdown links use the same client-side navigation; external links, files, and Studio links retain normal anchor behavior. Reduced-motion preferences and keyboard navigation disable the motion. Ordinary navigation remains available when view transitions are unsupported; no navigation delay or animation library is added.

Accordo shares its wordmark between its Engineering project entry and its own page. The three homepage introduction links, and the Engineering, Music, and Accordo navbar links when clicked from home, share a 560ms upward glide with their destination heading or logo. AI & Software changes to Engineering during the glide; Music and the Accordo wordmark retain their identity. The rest of the page enters after the heading has moved out of its way. Between top-level sections, a small horizontal slide follows navbar order in either direction. Returning Home uses this page slide too. Detail pages retain their title transitions. These effects apply to site links; native browser history retains the router’s normal restoration behavior. Opening a destination from the map uses a dedicated navigation type: only the selected inspector heading (or Accordo wordmark) moves into the destination header. Other previews on the homepage do not compete for the same transition. Inspector selection fades remain separate from page navigation. Video previews move with the surrounding page during section navigation; only recording-detail transitions share the video geometry. The persistent player uses separate per-page snapshots for section slides while preserving the live iframe.

## Pages

The wordmark returns home. Navigation is Engineering (`/work`), Music, Accordo, Writing, and About. Engineering shows a two-column project index (one column on phones), with equal title sizes, Studio descriptions and development credits, and direct project/app/source links. Resume and GitHub are at the top. Open source is a short supporting note linking to `/work/contributions`, where the full list retains Merged, Open, and Closed filters, live-reconciled counts, six entries initially, and a Show all control. The legacy `/contributions` route redirects there. Engineering notes and their navigation link appear only when technical writing has been published. Notes use the same compact list as the homepage. Project details live at `/work/[slug]`; Accordo has its own page at `/accordo`. The Writing archive includes notes and essays from both content sections. Recording, writing, series, and engineering detail pages have labeled back links to their indexes. Accordo is a top-level section and has no back-to-Engineering link.

## Content

- `lib/public-profile.ts` supplies the default introduction, portrait, contact links, YouTube channel, and resume. Database profile settings take precedence when configured.
- `content/posts/` contains local Markdown entries. Keep `draft: true` on unpublished writing. The two existing essay drafts remain private.
- The homepage shows the two most recently published recordings, each with a smaller player beside its details. The Music page is a two-column recording library, with one column on phones. Each recording shows a video preview, composer, linked piece title, and known performance details. Titles open their dedicated piece pages in the same tab. A single persistent player in the root layout moves between matching recording slots, preserving the iframe, playback time, volume, and pause state through client-side navigation and browser Back. Opening a different video replaces the active player; moving to a page without that recording stops playback. Player removal waits for the active page transition to finish, so cleanup cannot cancel the Music-to-Engineering slide. Returning before cleanup completes cancels that pending removal. Scrolling and resizing keep the player aligned with its slot. The homepage links “About this performance” to the dedicated recording page when performance notes exist. Redundant “Watch on YouTube” and “Open full page” preview links are omitted. YouTube previews throughout these sections load thumbnail images first and create an autoplaying privacy-hosted iframe only after the visitor presses Play; opening Music no longer initializes three YouTube players. The player’s dimensions are reserved before images load. Larger artwork is used where available, with a smaller thumbnail fallback. Recording titles and previews share a glide into the detail page; the surrounding copy appears after the title clears its destination. Reduced-motion and keyboard preferences still apply. Full-page recordings show the composer, one piece title, known performance date and venue, the player, notes, and adjacent recordings. Comments sit in a closed Discussion disclosure. The imported standalone YouTube link is omitted from this presentation without changing saved content. It has a separate compact writing section and shows series only when entries belong to one. Original compositions are labeled using the profile name. The Music page has no duplicate featured player, Accordo promotion, or bottom contact block. Schumann’s Abegg Variations was performed on November 30, 2023, at the UF School of Music piano recital, when Pablo was 18 (confirmed September 18, 2026). This is stored in local content and the existing database recording, revision 4. Its website publication date remains September 14, 2026. Performance dates for Beethoven’s Sonata Op. 10 No. 2 and the composition in E-flat major are unspecified. Public performance dates and publication dates are labeled separately.
- Performance frontmatter uses `kind: performance`, `workTitle`, `composer`, and `youtubeUrl`. These records work in the local site and carry their video metadata into the publishing database when imported.
- `data/graph.json` holds curated concepts and project relationships. Local entries connect to matching curated concepts through their tags.

The default resume is the PDF supplied by Pablo on September 19, 2026, preserved byte for byte. On September 27 it was also uploaded and selected through Studio, and the About biography was saved with the exact wording “U.S. DoD Secret Clearance Eligibility Granted.” The public resume was checked against the supplied PDF byte for byte. The clearance line remains ordinary editable profile text.

The resume and external website links open in separate tabs. Homepage Get in touch opens Pablo’s LinkedIn message composer. The email icons copy the address and show confirmation; a failed copy displays the address for manual selection. Nova’s private source repository is not linked from the public project list.

Homepage copy keeps AI/software and music broad, with a separate Accordo introduction. The bio starts a new line before the University of Florida sentence. The homepage uses one H1 for Pablo’s name, H2 section headings, and H3 titles for posts and projects within those sections.

The homepage Projects section features a project with a public app link from the existing featured selection, followed by two smaller project entries. Each has a title, short summary, and project/app/source links. The Kit AI architecture explanation is omitted from the homepage; detailed project content remains available by opening the project. The development credit was removed from both the saved Kit AI article and local fallback at Pablo’s request.

About uses a portrait beside one biography, with education and contact links below. The complete biography is editable through Studio’s Profile > About field, without appended hardcoded paragraphs. Resume and LinkedIn open in new tabs; the email control copies the address with confirmation.

Search opens a native modal dialog with the public map beside live results. Selecting a point searches its title or topic, and matches are emphasized without hiding the rest of the map. The full `/search` page uses the same interface; its query stays in the URL and restores correctly after browser Back. On phones, results move above the map while a query is active. The dialog supports native focus containment, Escape, and arrow-key results navigation. It loads the public graph on demand through `/api/search/graph`; opening search does not create another video player.

Search covers published projects, notes, essays, recordings, and their public graph topics. It ranks exact titles first and supports prefixes of at least three characters, spelling mistakes (including swapped letters), accents, joined project names, and related terms. Short acronyms are exact words, so AI does not match aim or aid. AI also finds retrieval, RAG, LLM, embeddings, and machine-learning work at a lower weight. Every meaningful query word must match. Excerpts use a relevant paragraph when the summary does not explain the match, and avoid running into subsequent headings or cutting a word in half. Metadata includes composers, venues, technologies, and series. Header results show the top five and link to all matches. Draft, scheduled, and graph visibility still come from the public readers.

Homepage recording titles and “About this performance” links open the dedicated piece page with the same title/video expansion as Music. The recording back link uses the actual browser history entry, labeled Home, Music, Search, or the originating section. Returning to Home or Music captures the recording before traversing history, restores the saved scroll position before revealing the destination, and glides the video into its original slot. Copy appears after the video clears it. There is no visible trip to the top followed by scrolling, and a matching live iframe keeps playing. Reduced-motion, keyboard, and unsupported browsers restore instantly. Origins and scroll positions are kept per browser history entry without modifying the router's existing fields, survive refresh, and do not create loops through adjacent recordings. Direct visits without an internal origin fall back to Music. The browser's own Back control retains normal history restoration behavior.

The map, Recordings, Projects, and Recent writing share a heading scale, with project titles always smaller. Recent writing uses compact titles, dates, reading times, summaries, and a centered All posts link, inspired by Peter Steinberger’s homepage. The duplicate contact section is removed. The footer has Pablo’s copyright and profile icons, with no new content or code license declared. Light mode is the default for a first visit and explicitly uses pure white for the page canvas and diagram surface. The theme switch preserves a visitor's saved light or dark choice.

Open source is a single supporting note on the homepage and Engineering page, without featured pull requests or counts. The full contribution history is available at `/work/contributions`; `homepageTitle` in `data/contributions.json` supplies a concise display title where present. The homepage and Engineering page do not make GitHub status requests. Connections uses the same page width as the surrounding sections.

The Accordo wordmark on the homepage and `/accordo` uses Pablo’s supplied transparent artwork in `public/brand/accordo-wordmark.png`. Next.js serves a smaller optimized image; CSS renders the lettering white in dark mode. The original marketing files are unchanged.

## Publishing setup

The source includes a database-backed editor at `/admin`; it needs a Postgres database, GitHub sign-in, and the environment values documented in `.env.example`. The public preview does not require those services.

For a new publishing database, run `npm run db:migrate`, then `npm run db:import`. Import loads the local entries, projects, and performance metadata. Import is a bootstrap operation: repeating it updates matching slugs from local files, so do not use it to overwrite later editorial changes made in the browser.

The GitHub OAuth application, **Pablo Pupo Studio**, now uses the production callback `https://pablopupo.com/api/auth/callback/github`. Owner sign-in on the custom domain was verified during the October 6, 2026 release. Local public previews still work; local Studio sign-in requires a separate local OAuth configuration with callback `http://127.0.0.1:3100/api/auth/callback/github` and matching environment values.

Set `BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL` to the actual site origin when deploying. The GitHub OAuth callback must be `<origin>/api/auth/callback/github`. `NEXT_PUBLIC_SITE_URL` controls canonical URLs, sitemap, feed links, and social metadata. Set Blob credentials for media uploads; never commit secrets.

The Vercel project `pablopupo-com` is connected to the existing Neon database and its own media store. The public site is https://pablopupo.com, with HTTPS and a permanent redirect from `www.pablopupo.com`. The Vercel address https://pablopupo-com.vercel.app remains available. Production `BETTER_AUTH_URL` and `NEXT_PUBLIC_SITE_URL` use the custom domain. The live database contains three recordings, the Accordo introduction, and four projects; the two earlier drafts were preserved. Do not rerun the bootstrap importer against this database.

At `/admin`, GitHub sign-in is restricted to the configured owner account. Studio opens the latest draft; adding a title creates a URL suggestion and starts draft autosave. Preview a saved draft before publishing. Published posts require a deliberate save to apply edits, and revision history retains previous versions. Publishing refreshes public listings, related notes, the feed, and sitemap.

### Recordings, engineering posts, and series

Choose **New recording** for a music post, or **Engineering post** for a technical note. For recordings, add the piece title, composer, and YouTube link; those fields and a post title are needed before draft autosave starts. Write about the interpretation in Performance notes or the main article editor. Venue and performance date are optional. Engineering posts use the same writing editor and appear in the engineering notes archive at `/work/notes`.

`/admin?entry=<slug>` opens a specific recording after the owner's GitHub sign-in. Performance date uses a calendar picker and preserves the selected calendar day independently of timezone. Venue or event and Performance notes are editable in the Recording section. Saving updates the performance metadata without changing the website publication date.

Series are optional and have no predefined subject or schedule. Give related posts the same **Series name**. Set **Post order** when the sequence matters; otherwise posts are ordered by publication date. The public series page appears after the first post is published, with a latest recording, an index, and previous/next links on its posts. Drafts and future scheduled posts stay private. Series names and order are retained through saves and revision history using reserved `series:` and `part:` tags; those tags are hidden from public tag labels. Local Markdown posts can use the same tags.

The homepage groups public map entries from a series into one point to keep weekly posts from crowding the map. Existing graph visibility choices remain in effect. Its Payments point connects to both Accordo and Nova.

Production credentials and the hosted OAuth callback are configured. Owner sign-in and authenticated page editing controls were verified on the custom domain. Draft publishing and revision restoration pass automated tests with an isolated database; no test posts were published to the live database.

Authentication failures now appear in Studio and re-enable its buttons. Mutation requests require the configured Origin and Host, accounting for Next.js normalizing the internal request URL to localhost. Profile saves revalidate the shared layout so biography, contact links, metadata, and resume references refresh together. Profile asset previews show the same default portrait and resume as the public site when no replacement is selected.

### What is editable now

| Studio area | Editable content |
| --- | --- |
| Posts and recordings | Titles, summaries, article body, performance notes, composer, work title, YouTube URL, performance date, venue, tags, series, publishing state, and revisions |
| Work | Project descriptions, article body, links, technology lists, featured selection, and publishing state |
| Pages | Homepage introductions, Engineering/Music/Writing introductions, Accordo headings and story, and About education text |
| Profile | Site title, bio, About introduction, portrait, resume, contact details, and social links |
| Map | Concepts, connections, labels, and visibility |

At `/admin/pages`, choose a page, edit plain text with a live text preview, and select **Save changes** to apply it. Edits stay in the form when switching between page controls. Leaving with unsaved text prompts a warning. Saves send only changed fields, preserve other page and profile content, and reject stale versions from other tabs. Blank optional text stays blank. Page titles used by navigation and transitions remain part of the layout. Profile remains the home for the full biography, portrait, resume, and contact details.

Migration `0008_editable_page_copy` adds a default-empty JSON column without rewriting existing settings. It was applied to the configured database on September 27, 2026. A page edit was saved through the authenticated UI, reloaded, and verified on the public Engineering page. Recording fields, the existing recital date, and revision controls were inspected in Studio. Publishing, revision restoration, and stale-save behavior are covered by isolated database tests; no test posts were published to the live database.

The October 6, 2026 release publishes the current site with its existing writing. The owner chose to improve project and music content after launch. Public routes, HTTPS redirects, canonical URLs, and hosted owner sign-in are checked as part of the release. A live draft-preview-publish-edit cycle should accompany the next intended editorial change; do not test publishing by changing live content without the owner’s intended edits.

## Verification

```sh
npm test
npx tsc --noEmit
npm run build
```
