import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRootMetadata } from "@/lib/metadata";
import { DEFAULT_PUBLIC_PROFILE } from "@/lib/public-profile";

const mocks = vi.hoisted(() => ({
  getPublicProfile: vi.fn(),
}));

vi.mock("next/font/local", () => ({
  default: vi.fn(() => ({ variable: "font-serif" })),
}));

vi.mock("./nav", () => ({
  default: () => <nav>Navigation</nav>,
}));

vi.mock("@/components/vercel-analytics", () => ({
  default: () => <span data-vercel-analytics="enabled" />,
}));

vi.mock("@/components/page-view-tracker", () => ({
  default: () => <span data-first-party-analytics="enabled" />,
}));

vi.mock("@/lib/public-profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-profile")>()),
  getPublicProfile: mocks.getPublicProfile,
}));

beforeEach(() => {
  vi.resetModules();
  mocks.getPublicProfile.mockReset();
  mocks.getPublicProfile.mockResolvedValue(DEFAULT_PUBLIC_PROFILE);
});

describe("root layout discovery metadata", () => {
  it("uses the shared root metadata contract", async () => {
    const layout = await import("./layout");

    expect(layout.generateMetadata).toBeTypeOf("function");
    await expect(layout.generateMetadata()).resolves.toEqual(
      createRootMetadata(DEFAULT_PUBLIC_PROFILE)
    );
  });

  it("renders escaped Person JSON-LD", async () => {
    const { default: RootLayout } = await import("./layout");

    const html = renderToStaticMarkup(
      await RootLayout({ children: <p>Page</p> })
    );

    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('"@type":"Person"');
    expect(html).toContain("Miami, Florida");
    expect(html).toContain("December 2026");
    expect(html).toContain('data-vercel-analytics="enabled"');
    expect(html).toContain('data-first-party-analytics="enabled"');
    expect(html).toContain('<a class="skip-link" href="#main-content">');
    expect(html).toContain('<main id="main-content">');
    expect(html).not.toContain("Handtevy");
  });

  it("renders only UI-managed footer links", async () => {
    mocks.getPublicProfile.mockResolvedValue({
      ...DEFAULT_PUBLIC_PROFILE,
      githubUrl: "https://github.com/profile-from-ui",
      linkedinUrl: null,
      youtubeUrl: "https://youtube.com/@profile-from-ui",
      contactEmail: "hello@example.com",
      resumeUrl: "/media/current-resume.pdf",
    });
    const { default: RootLayout } = await import("./layout");

    const html = renderToStaticMarkup(
      await RootLayout({ children: <p>Page</p> })
    );

    expect(html).toContain('href="https://github.com/profile-from-ui"');
    expect(html).not.toContain("LinkedIn");
    expect(html).toContain('href="https://youtube.com/@profile-from-ui"');
    expect(html).toContain('href="/resume"');
    expect(html).not.toContain('href="/media/current-resume.pdf"');
    expect(html).toContain('href="mailto:hello@example.com"');
    expect(html).toContain('href="/rss.xml"');
    expect(html).not.toContain("Hugging Face");
  });

  it("propagates configured profile failures from metadata", async () => {
    const profileError = new Error("database unavailable");
    mocks.getPublicProfile.mockRejectedValue(profileError);
    const layout = await import("./layout");

    await expect(layout.generateMetadata()).rejects.toBe(profileError);
  });
});
