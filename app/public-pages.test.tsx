import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolvePageCopy } from "@/lib/page-copy";

const mocks = vi.hoisted(() => ({
  getPublicProfile: vi.fn(),
  getPublicEntries: vi.fn(),
  getPublicEntry: vi.fn(),
  getPublicProjects: vi.fn(),
  getLiveContributions: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/public-profile", () => ({
  getPublicProfile: mocks.getPublicProfile,
  DEFAULT_PUBLIC_PROFILE: { siteTitle: "Pablo Pupo" },
}));

vi.mock("@/lib/public-content", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-content")>()),
  getPublicEntries: mocks.getPublicEntries,
  getPublicEntry: mocks.getPublicEntry,
  getPublicProjects: mocks.getPublicProjects,
}));

vi.mock("@/lib/github-status", () => ({
  getLiveContributions: mocks.getLiveContributions,
}));

vi.mock("@/components/knowledge-graph", () => ({
  default: ({
    data,
    initialSelectedId,
  }: {
    data: { nodes: Array<{ id: string }> };
    initialSelectedId?: string | null;
  }) => (
    <div data-testid="knowledge-graph" data-initial-selection={initialSelectedId ?? "none"}>
      Knowledge graph canvas
      {data.nodes.map((node) => (
        <span key={node.id}>{node.id}</span>
      ))}
    </div>
  ),
}));

vi.mock("@/components/markdown-content", () => ({
  default: ({ markdown, className }: { markdown: string; className?: string }) => (
    <div className={className}>{markdown}</div>
  ),
  MarkdownContent: ({
    markdown,
    className,
  }: {
    markdown: string;
    className?: string;
  }) => <div className={className}>{markdown}</div>,
}));

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  usePathname: () => null,
  useRouter: () => ({ back: vi.fn() }),
}));

const profile = {
  pageCopy: resolvePageCopy(),
  siteTitle: "Pablo Pupo",
  headline: "AI Engineer at Handtevy",
  location: "Miami, Florida",
  graduationOn: "2026-12-01",
  introMarkdown:
    "CS student at UF. AI engineer at Handtevy. Classical pianist and music enthusiast.",
  aboutMarkdown:
    "I study computer science and build applied AI systems. I write technical notes about what I learn.",
  contactEmail: "pablofpupo23@gmail.com",
  githubUrl: "https://github.com/pablopupo",
  linkedinUrl: "https://linkedin.com/in/pablopupo",
  youtubeUrl: null,
  portraitUrl: "/media/pablo-pupo-portrait.jpg",
  portraitAlt: "Pablo Pupo smiling outside",
  resumeUrl: "/Pablo-Pupo-Resume.pdf",
};

const writingEntry = {
  id: "writing-id",
  slug: "database-writing",
  kind: "essay" as const,
  section: "writing" as const,
  tags: ["evaluation", "retrieval"],
  title: "Database writing",
  summary: "A technical note loaded from the publishing database.",
  bodyMarkdown: "## The system\n\nThe published body.",
  publishedAt: "2026-07-20T12:00:00.000Z",
  readMinutes: 4,
  performance: null,
};

const musicEntry = {
  id: "music-id",
  slug: "database-performance",
  kind: "performance" as const,
  section: "music" as const,
  tags: ["piano", "Chopin"],
  title: "Database performance",
  summary: "A piano performance and short reflection.",
  bodyMarkdown: "Performance notes.",
  publishedAt: "2026-07-19T12:00:00.000Z",
  readMinutes: 2,
  performance: {
    workTitle: "Ballade No. 1",
    composer: "Frédéric Chopin",
    venue: null,
    performedAt: "2026-06-01T19:00:00.000Z",
    youtubeUrl: "https://youtu.be/dQw4w9WgXcQ",
    notesMarkdown: "A study in long-form phrasing.",
  },
};

const project = {
  id: "project-id",
  slug: "database-project",
  kind: "experience" as const,
  title: "Database project",
  organization: "Example AI Lab",
  summary: "A public applied-AI system.",
  bodyMarkdown: "A retrieval system grounded in musical notation.",
  startedOn: "2025-06-01",
  endedOn: null,
  publishedAt: "2026-07-01T12:00:00.000Z",
  featured: true,
  technologies: ["TypeScript", "Retrieval"],
  links: [
    {
      kind: "repository" as const,
      label: "GitHub",
      url: "https://github.com/pablopupo/database-project",
    },
  ],
};

const contribution = {
  repo: "docling-project/docling",
  pr: 3721,
  url: "https://github.com/docling-project/docling/pull/3721",
  title: "code language detection for parsed code blocks",
  date: "2026-07-02",
  status: "merged" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getPublicProfile.mockResolvedValue(profile);
  mocks.getPublicEntries.mockResolvedValue([writingEntry, musicEntry]);
  mocks.getPublicEntry.mockResolvedValue(writingEntry);
  mocks.getPublicProjects.mockResolvedValue([project]);
  mocks.getLiveContributions.mockResolvedValue([contribution]);
});

describe("public pages", () => {
  it("renders saved page text across all indexes and escapes plain text", async () => {
    mocks.getPublicProfile.mockResolvedValue({ ...profile, pageCopy: {
      ...profile.pageCopy, homeMusicIntro: "Home music text", musicIntro: "Music page text", writingIntro: "Writing page text", engineeringIntro: "Engineering page text", accordoTitle: "New Accordo heading", accordoStory: "First paragraph.\n\n<script>Not executable</script>", aboutSchool: "Updated university",
    } });
    const [home, music, writing, work, accordo, about] = await Promise.all([import("./page"), import("./music/page"), import("./writing/page"), import("./work/page"), import("./accordo/page"), import("./about/page")]);
    const rendered = await Promise.all([home, music, writing, work, accordo, about].map(async (page) => renderToStaticMarkup(await page.default())));
    ["Home music text", "Music page text", "Writing page text", "Engineering page text", "New Accordo heading", "Updated university"].forEach((text, index) => expect(rendered[index]).toContain(text));
    expect(rendered[4]).toContain("&lt;script&gt;Not executable&lt;/script&gt;");
    expect(rendered[4]).not.toContain("<script>Not executable");
  });
  it("renders a music series with its latest recording and ordered posts, without exposing internal tags", async () => {
    const entries = [
      { ...musicEntry, slug: "second-recording", title: "Second recording", tags: ["piano", "series:Practice journal", "part:2"], publishedAt: "2026-09-08" },
      { ...musicEntry, slug: "first-recording", title: "First recording", tags: ["piano", "series:Practice journal", "part:1"], publishedAt: "2026-09-01" },
    ];
    mocks.getPublicEntries.mockResolvedValue(entries);
    const { default: SeriesPage, generateMetadata } = await import("./music/series/[slug]/page");
    const props = { params: Promise.resolve({ slug: "practice-journal" }) };
    const html = renderToStaticMarkup(await SeriesPage(props));
    expect(html).toContain("Practice journal</h1>");
    expect(html).toContain("Latest recording");
    expect(html).toContain('href="/music/second-recording"');
    expect(html.indexOf("First recording")).toBeLessThan(html.indexOf("Second recording"));
    expect(html).not.toContain("series:Practice journal");
    expect((await generateMetadata(props)).alternates).toMatchObject({ canonical: "/music/series/practice-journal" });
    const { default: Music } = await import("./music/page");
    expect(renderToStaticMarkup(await Music())).toContain('href="/music/series/practice-journal"');
    mocks.getPublicEntry.mockResolvedValue(entries[1]);
    const { default: EntryPage } = await import("./music/[slug]/page");
    const post = renderToStaticMarkup(await EntryPage({ params: Promise.resolve({ slug: "first-recording" }) }));
    expect(post).toContain('aria-label="More in this series"');
    expect(post).toContain("Next post");
    expect(post).not.toContain("part:1");
  });

  it("supports engineering series and returns 404 for series with no published posts", async () => {
    mocks.getPublicEntries.mockResolvedValue([{ ...writingEntry, tags: ["engineering", "series:Search experiments"] }]);
    const { default: SeriesPage } = await import("./writing/series/[slug]/page");
    const html = renderToStaticMarkup(await SeriesPage({ params: Promise.resolve({ slug: "search-experiments" }) }));
    expect(html).toContain("Search experiments</h1>");
    expect(html).not.toContain("Latest recording");
    const { default: Notes } = await import("./work/notes/page");
    expect(renderToStaticMarkup(await Notes())).toContain('href="/writing/series/search-experiments"');
    await expect(SeriesPage({ params: Promise.resolve({ slug: "unpublished" }) })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("selects Gradus, Kit AI, and Nova for homepage work", async () => {
    const { selectSelectedProjects } = await import("./page");
    const projects = [
      { slug: "gradus-ad-parnassum", featured: true },
      { slug: "kit-ai", featured: true },
      { slug: "nova", featured: true },
      { slug: "accordo", featured: false },
    ];

    expect(
      selectSelectedProjects(projects).map((candidate) => candidate.slug)
    ).toEqual(["gradus-ad-parnassum", "kit-ai", "nova"]);
  });

  it("introduces Pablo before the graph and provides clear paths to both careers", async () => {
    const { default: Home } = await import("./page");

    const html = renderToStaticMarkup(await Home());

    expect(html).toContain('data-initial-selection="none"');

    expect(html).toContain('src="/media/pablo-pupo-portrait.jpg"');
    expect(html).toContain('<h1 id="home-title">');
    expect(html).toContain("Pablo Pupo</h1>");
    expect(html).toContain(
      "CS student at UF. AI engineer at Handtevy. Classical pianist and music enthusiast."
    );
    expect(html).not.toContain("Building Software, Playing Piano");
    expect(html).toContain("AI &amp; Software");
    expect(html).toContain('<h2 id="music-title">Music</h2>');
    expect(html).toContain("View resume");
    expect(html).toContain("Get in touch");
    expect(html).toContain('href="/work/contributions"');
    expect(html).not.toContain("Projects, notes, and performances.");
    expect(html).not.toContain("Hi, I’m Pablo.");
    expect(html).not.toContain("Applied AI, reliable software, and classical piano.");
    expect(html).not.toContain('class="hero-focus"');
    expect(html).not.toContain("Software Engineer, Applied AI");
    expect(html).not.toContain("Miami, Florida");
    expect(html).not.toContain("December 2026");
    expect(html).toContain('href="/resume"');
    expect(html).toContain('aria-label="Resume"');
    expect(html).toContain('href="https://www.linkedin.com/messaging/compose/?recipient=pablopupo"');
    expect(html).toContain('aria-label="Copy email address"');
    expect(html).toContain('aria-label="GitHub"');
    expect(html).toContain('aria-label="LinkedIn"');
    expect(html).toContain('aria-label="RSS"');
    expect(html).toContain('class="profile-icon-links"');
    expect(html).toMatch(
      /<a (?=[^>]*href="\/about")(?=[^>]*class="portrait-link")[^>]*><div class="portrait-frame">/
    );
    expect(html).toContain("Handtevy");
    expect(html).not.toContain("200,000");
    expect(html.indexOf("Knowledge graph canvas")).toBeGreaterThan(
      html.indexOf(
        "CS student at UF. AI engineer at Handtevy. Classical pianist and music enthusiast."
      )
    );
    expect(html.indexOf("Knowledge graph canvas")).toBeLessThan(
      html.indexOf('<h2 id="selected-work-title">Projects</h2>')
    );
    expect(html.indexOf("Knowledge graph canvas")).toBeGreaterThan(
      html.indexOf("Explore my music")
    );
    expect(html).not.toContain("Knowledge graph</h2>");
    expect(html).toContain("Database project");
    expect(html).toContain('href="/work/database-project"');
    expect(html).toContain("A public applied-AI system.");
    expect(html).toContain("Database writing");
    expect(html).toContain("Ballade No. 1");
    expect(html).toContain('href="/music/database-performance"');
    expect(html).toContain("June 1, 2026");
    expect(html).toMatch(/href="\/resume"[^>]*target="_blank"/);
    expect(html).toContain('src="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"');
    expect(html).toContain("project:database-project");
    expect(html).toContain("entry:writing:database-writing");
    expect(html).toContain("entry:music:database-performance");
    expect(html).not.toContain("docling #3721");
    expect(html).not.toContain("All contributions");
    expect(mocks.getLiveContributions).not.toHaveBeenCalled();
  });

  it("offers a direct path to contributions and the resume on /work", async () => {
    const module = await import("./work/page").catch(() => undefined);
    expect(module?.default).toBeTypeOf("function");

    const html = renderToStaticMarkup(await module!.default());

    expect(html).toContain("Database project");
    expect(html).toContain("TypeScript · Retrieval");
    expect(html).toContain('href="/work/contributions"');
    expect(html).toContain("View resume");
    expect(html).toContain("<h1>Engineering</h1>");
    expect(html).not.toContain('aria-label="Filter contributions by status"');
    expect(html).toContain('href="/writing/database-writing"');
    expect(html).toContain("I also enjoy contributing to open source.");
    expect(html).not.toContain("docling #3721");
    expect(html.indexOf("Database project")).toBeLessThan(
      html.indexOf('class="open-source-note"')
    );
    expect(html).not.toContain(
      "Applied AI projects, experiments, and contributions to tools I use."
    );
    expect(mocks.getLiveContributions).not.toHaveBeenCalled();

    const { default: Contributions, metadata } = await import("./work/contributions/page");
    const archive = renderToStaticMarkup(await Contributions());
    expect(archive).toContain('<h1>Open source</h1>');
    expect(archive).toContain('href="/work"');
    expect(archive).toContain('aria-label="Filter contributions by status"');
    expect(archive).toContain("docling #3721");
    expect(metadata.alternates?.canonical).toBe("/work/contributions");
  });

  it("does not advertise engineering notes until a public technical entry exists", async () => {
    mocks.getPublicEntries.mockResolvedValue([musicEntry]);
    const { default: Work } = await import("./work/page");
    const html = renderToStaticMarkup(await Work());
    expect(html).not.toContain('href="#technical-notes"');
    expect(html).not.toContain('id="technical-notes"');
    expect(html).not.toContain("I’m preparing notes");
    expect(html).not.toContain("Discuss an opportunity");
  });

  it("keeps both career paths visible without empty homepage feeds", async () => {
    mocks.getPublicEntries.mockResolvedValue([]);
    const { default: Home } = await import("./page");
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("Explore my engineering work");
    expect(html).toContain("Explore my music");
    expect(html).not.toContain("recent-writing-title");
    expect(html).not.toContain("recent-music-title");
    expect(html).not.toContain("coming soon");
  });

  it("keeps music useful before recordings are published without fake performances", async () => {
    mocks.getPublicEntries.mockResolvedValue([]);
    const { default: Music } = await import("./music/page");
    const html = renderToStaticMarkup(await Music());
    expect(html).toContain("<h1>Music</h1>");
    expect(html).toContain("Piano recordings, original compositions, and notes on music.");
    expect(html).not.toContain("Contact me about music");
    expect(html).not.toContain("iframe");
    expect(html).not.toContain("performances-title");
    expect(html).not.toContain("No performances");
  });

  it("keeps writing and music in their own editorial indexes", async () => {
    const [{ default: Writing }, { default: Music }] = await Promise.all([
      import("./writing/page"),
      import("./music/page"),
    ]);

    const writingHtml = renderToStaticMarkup(await Writing());
    const musicHtml = renderToStaticMarkup(await Music());

    expect(writingHtml).toContain("Database writing");
    expect(writingHtml).not.toContain("Database performance");
    expect(musicHtml).toContain('href="/music/database-performance"');
    expect(musicHtml).toMatch(/<a (?=[^>]*href="\/music\/database-performance")(?![^>]*target=)[^>]*>/);
    expect(musicHtml).toContain("Ballade No. 1");
    expect(musicHtml).toContain("Frédéric Chopin");
    expect(musicHtml).toContain(
      'src="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"'
    );
    expect(musicHtml).not.toContain(musicEntry.summary);
    expect(musicHtml).not.toContain(
      musicEntry.performance.notesMarkdown
    );
  });

  it("archives notes and essays by publication year, newest first, across both subjects", async () => {
    mocks.getPublicEntries.mockResolvedValue([
      { ...writingEntry, slug: "older", title: "An older essay", publishedAt: "2025-06-01T12:00:00.000Z" },
      musicEntry,
      { ...writingEntry, kind: "note", slug: "newer", title: "A newer note", publishedAt: "2026-08-01T12:00:00.000Z" },
      { ...writingEntry, section: "music", slug: "music-essay", title: "An essay about music", publishedAt: "2026-01-01T00:00:00.000Z", tags: ["music", "series:Listening", "part:1"] },
    ]);
    const { default: Writing } = await import("./writing/page");
    const html = renderToStaticMarkup(await Writing());
    expect(html).toContain('<h1>Writing</h1>');
    expect(html).toContain('<h2 id="writing-year-2026">2026</h2>');
    expect(html).toContain('<h2 id="writing-year-2025">2025</h2>');
    expect(html.indexOf("A newer note")).toBeLessThan(html.indexOf("An essay about music"));
    expect(html.indexOf("An essay about music")).toBeLessThan(html.indexOf("An older essay"));
    expect(html).toContain('href="/music/music-essay"');
    expect(html).toContain('href="/writing/newer"');
    expect(html).toContain('href="/music/series/listening"');
    expect(html).toContain('dateTime="2026-01-01T00:00:00.000Z"');
    expect(html).toContain("4 min read");
    expect(html).toContain(writingEntry.summary);
    expect(html).not.toContain("Database performance");
    expect(html).not.toContain("series:Listening");
    expect(html).not.toContain("part:1");
  });

  it("keeps an empty Writing archive useful without invented posts", async () => {
    mocks.getPublicEntries.mockResolvedValue([]);
    const { default: Writing } = await import("./writing/page");
    const html = renderToStaticMarkup(await Writing());
    expect(html).toContain("Nothing published yet.");
    expect(html).toContain('href="/work"');
    expect(html).toContain('href="/music"');
    expect(html).toContain('href="/rss.xml"');
    expect(html).not.toContain("writing-year-");
  });

  it("uses a shared editorial introduction for Engineering, Writing, and Music", async () => {
    const [{ default: Work }, { default: Writing }, { default: Music }] =
      await Promise.all([
        import("./work/page"),
        import("./writing/page"),
        import("./music/page"),
      ]);

    const [workHtml, writingHtml, musicHtml] = await Promise.all([
      Work().then(renderToStaticMarkup),
      Writing().then(renderToStaticMarkup),
      Music().then(renderToStaticMarkup),
    ]);

    for (const html of [workHtml, writingHtml, musicHtml]) {
      expect(html).toContain(
        'class="editorial-header"'
      );
    }
  });

  it("renders the editable biography with a portrait, education, and contact links", async () => {
    const { default: About } = await import("./about/page");

    const html = renderToStaticMarkup(await About());

    expect(html).toContain("<h1>About</h1>");
    expect(html).toContain(profile.aboutMarkdown);
    expect(html).not.toContain("A little about me");
    expect(html).not.toContain("Music is a central part of my life");
    expect(html).toContain("University of Florida");
    expect(html).toContain("Miami, Florida");
    expect(html).toContain("December 2026");
    expect(html).toContain('href="/resume"');
    expect(html).toContain('aria-label="Copy email address"');
  });

  it("renders a published database entry with safe Markdown", async () => {
    const { default: EntryPage, generateMetadata } = await import(
      "./writing/[slug]/page"
    );

    const html = renderToStaticMarkup(
      await EntryPage({ params: Promise.resolve({ slug: writingEntry.slug }) })
    );
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: writingEntry.slug }),
    });

    expect(mocks.getPublicEntry).toHaveBeenCalledWith(writingEntry.slug);
    expect(mocks.getPublicEntries).toHaveBeenCalled();
    expect(html).toContain("Database writing");
    expect(html).toContain("The published body.");
    expect(html).toContain("evaluation · retrieval");
    expect(metadata).toMatchObject({
      title: "Database writing",
      description: writingEntry.summary,
      alternates: { canonical: `/writing/${writingEntry.slug}` },
      openGraph: {
        type: "article",
        title: "Database writing",
        description: writingEntry.summary,
        url: `/writing/${writingEntry.slug}`,
      },
      twitter: {
        title: "Database writing",
        description: writingEntry.summary,
      },
    });
  });

  it("renders music entries only through the music detail route", async () => {
    mocks.getPublicEntry.mockResolvedValue({ ...musicEntry, bodyMarkdown: `${musicEntry.bodyMarkdown}\n\n[Watch on YouTube](${musicEntry.performance.youtubeUrl}).` });
    const { default: MusicEntryPage, generateMetadata } = await import(
      "./music/[slug]/page"
    );

    const html = renderToStaticMarkup(
      await MusicEntryPage({
        params: Promise.resolve({ slug: musicEntry.slug }),
      })
    );

    expect(html).toContain("<h1>Ballade No. 1</h1>");
    expect(html).toContain('class="entry-page recording-page"');
    expect(html).not.toContain("Database performance");
    expect(html).not.toContain("Watch on YouTube");
    expect(html).toContain(musicEntry.bodyMarkdown);
    expect(html).toContain(
      'src="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"'
    );
    expect(html).toContain(musicEntry.performance.notesMarkdown);
    await expect(
      generateMetadata({
        params: Promise.resolve({ slug: musicEntry.slug }),
      })
    ).resolves.toMatchObject({
      alternates: { canonical: `/music/${musicEntry.slug}` },
      openGraph: { type: "article", url: `/music/${musicEntry.slug}` },
      twitter: { title: musicEntry.title },
    });
  });

  it("passes immediate same-section neighbors to writing details", async () => {
    const newer = {
      ...writingEntry,
      id: "newer-writing-id",
      slug: "newer-writing",
      title: "Newer writing",
      publishedAt: "2026-07-22T12:00:00.000Z",
    };
    const older = {
      ...writingEntry,
      id: "older-writing-id",
      slug: "older-writing",
      title: "Older writing",
      publishedAt: "2026-07-18T12:00:00.000Z",
    };
    mocks.getPublicEntries.mockResolvedValue([
      older,
      musicEntry,
      newer,
      writingEntry,
    ]);
    const { default: WritingEntryPage } = await import("./writing/[slug]/page");

    const html = renderToStaticMarkup(
      await WritingEntryPage({
        params: Promise.resolve({ slug: writingEntry.slug }),
      })
    );

    expect(html).toContain('href="/writing/newer-writing"');
    expect(html).toContain("Newer writing");
    expect(html).toContain('href="/writing/older-writing"');
    expect(html).toContain("Older writing");
    expect(html).not.toContain('href="/music/database-performance"');
  });

  it("rejects entries requested through the wrong section route", async () => {
    mocks.getPublicEntry.mockResolvedValue(musicEntry);
    const { default: WritingEntryPage } = await import("./writing/[slug]/page");

    await expect(
      WritingEntryPage({
        params: Promise.resolve({ slug: musicEntry.slug }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("returns the framework not-found response for an unknown entry", async () => {
    mocks.getPublicEntry.mockResolvedValue(undefined);
    const { default: EntryPage } = await import("./writing/[slug]/page");

    await expect(
      EntryPage({ params: Promise.resolve({ slug: "missing" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("declares canonical, RSS, and page-specific sharing metadata", async () => {
    const [home, work, writing, music, about] = await Promise.all([
      import("./page"),
      import("./work/page"),
      import("./writing/page"),
      import("./music/page"),
      import("./about/page"),
    ]);

    expect(home.metadata).toMatchObject({
      alternates: {
        canonical: "/",
        types: { "application/rss+xml": "/rss.xml" },
      },
    });
    expect(work.metadata).toMatchObject({
      alternates: {
        canonical: "/work",
        types: { "application/rss+xml": "/rss.xml" },
      },
      openGraph: { url: "/work", title: "Engineering" },
      twitter: { title: "Engineering" },
    });
    expect(writing.metadata).toMatchObject({
      alternates: {
        canonical: "/writing",
        types: { "application/rss+xml": "/rss.xml" },
      },
      openGraph: { url: "/writing", title: "Writing" },
      twitter: { title: "Writing" },
    });
    expect(music.metadata).toMatchObject({
      alternates: {
        canonical: "/music",
        types: { "application/rss+xml": "/rss.xml" },
      },
      openGraph: { url: "/music", title: "Music" },
      twitter: { title: "Music" },
    });
    expect(about.metadata).toMatchObject({
      alternates: {
        canonical: "/about",
        types: { "application/rss+xml": "/rss.xml" },
      },
      openGraph: { url: "/about", title: "About" },
      twitter: { title: "About" },
    });
    expect([
      home.revalidate,
      work.revalidate,
      writing.revalidate,
      music.revalidate,
      about.revalidate,
    ]).toEqual([60, 60, 60, 60, 60]);
  });
});
