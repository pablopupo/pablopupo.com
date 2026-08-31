import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  }: {
    data: { nodes: Array<{ id: string }> };
  }) => (
    <div data-testid="knowledge-graph">
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
}));

const profile = {
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

  it("leads with an editorial introduction and folds the graph into it", async () => {
    const { default: Home } = await import("./page");

    const html = renderToStaticMarkup(await Home());

    expect(html).toContain('src="/media/pablo-pupo-portrait.jpg"');
    expect(html).toContain('class="visually-hidden"');
    expect(html).toContain("Pablo Pupo</h1>");
    expect(html).toContain(
      "CS student at UF. AI engineer at Handtevy. Classical pianist and music enthusiast."
    );
    expect(html).not.toContain("Building Software, Playing Piano");
    expect(html).not.toContain("open-source work");
    expect(html).not.toContain("Projects, notes, and performances.");
    expect(html).not.toContain("Hi, I’m Pablo.");
    expect(html).not.toContain("Applied AI, reliable software, and classical piano.");
    expect(html).not.toContain('class="hero-focus"');
    expect(html).not.toContain("Software Engineer, Applied AI");
    expect(html).not.toContain("Miami, Florida");
    expect(html).not.toContain("December 2026");
    expect(html).toContain('href="/resume"');
    expect(html).toContain('aria-label="Résumé"');
    expect(html).toContain('href="mailto:pablofpupo23@gmail.com"');
    expect(html).toContain('aria-label="Email"');
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
      html.indexOf("Selected work")
    );
    expect(html).not.toContain("Knowledge graph</h2>");
    expect(html).toContain("Database project");
    expect(html).toContain("Experience");
    expect(html).toContain("Example AI Lab");
    expect(html).toContain("June 2025 to Present");
    expect(html).toContain("Database writing");
    expect(html).toContain("Database performance");
    expect(html).toContain("project:database-project");
    expect(html).toContain("entry:writing:database-writing");
    expect(html).toContain("entry:music:database-performance");
    expect(html).not.toContain("docling #3721");
    expect(html).not.toContain("All contributions");
    expect(mocks.getLiveContributions).not.toHaveBeenCalled();
  });

  it("keeps contributions as quiet evidence at the bottom of /work", async () => {
    const module = await import("./work/page").catch(() => undefined);
    expect(module?.default).toBeTypeOf("function");

    const html = renderToStaticMarkup(await module!.default());

    expect(html).toContain("Database project");
    expect(html).toContain("TypeScript · Retrieval");
    expect(html).toContain("Elsewhere");
    expect(html).toContain('<h2 id="contributions-title">Contributions</h2>');
    expect(html).toContain("docling #3721");
    expect(html.indexOf("Database project")).toBeLessThan(
      html.indexOf("Elsewhere")
    );
    expect(html).not.toContain(
      "Applied AI projects, experiments, and contributions to tools I use."
    );
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
    expect(musicHtml).toContain("Database performance");
    expect(musicHtml).toContain("Ballade No. 1");
    expect(musicHtml).toContain("Frédéric Chopin");
    expect(musicHtml).toContain(
      'src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"'
    );
    expect(musicHtml).toContain(musicEntry.summary);
    expect(musicHtml).not.toContain(
      musicEntry.performance.notesMarkdown
    );
  });

  it("anchors the Work, Writing, and Music introductions to one reading measure", async () => {
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
        'class="page-header section-index-header"'
      );
    }
  });

  it("presents applied AI first while being honest about AI systems learning", async () => {
    const { default: About } = await import("./about/page");

    const html = renderToStaticMarkup(await About());

    expect(html).toContain("Applied AI");
    expect(html).toContain("learning more about AI systems");
    expect(html).toContain("pianist");
    expect(html).toContain("University of Florida");
    expect(html).toContain("Miami, Florida");
    expect(html).toContain("December 2026");
    expect(html).toContain('href="/resume"');
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
    mocks.getPublicEntry.mockResolvedValue(musicEntry);
    const { default: MusicEntryPage, generateMetadata } = await import(
      "./music/[slug]/page"
    );

    const html = renderToStaticMarkup(
      await MusicEntryPage({
        params: Promise.resolve({ slug: musicEntry.slug }),
      })
    );

    expect(html).toContain("Database performance");
    expect(html).toContain("Ballade No. 1");
    expect(html).toContain(
      'src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"'
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
      openGraph: { url: "/work", title: "Work" },
      twitter: { title: "Work" },
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
