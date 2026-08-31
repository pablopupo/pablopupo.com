import { describe, expect, it } from "vitest";
import {
  absoluteSiteUrl,
  createSiteIdentity,
  publicEntryPath,
  publicProjectPath,
  serializeJsonLd,
  siteDescription,
  siteUrl,
} from "./site";
import { DEFAULT_PUBLIC_PROFILE } from "./public-profile";

describe("public site identity", () => {
  it("uses the approved applied AI and musician positioning", () => {
    const identity = createSiteIdentity(DEFAULT_PUBLIC_PROFILE);

    expect(identity).toMatchObject({
      name: "Pablo Pupo",
      headline: "AI Engineer at Handtevy",
      email: "pablofpupo23@gmail.com",
      location: "Miami, Florida",
      graduationOn: "2026-12-01",
    });
    expect(siteDescription).toContain("applied AI");
    expect(siteDescription).toBe(
      "Computer science student at the University of Florida. AI Engineer at Handtevy. Writing about applied AI, software engineering, and classical piano."
    );
    expect(siteDescription).not.toContain("open source");
    expect(siteDescription).not.toContain("piano as a classical pianist");
  });

  it("builds canonical URLs for entries and projects", () => {
    expect(absoluteSiteUrl("/")).toBe(siteUrl);
    expect(absoluteSiteUrl("/writing/retrieval-notes")).toBe(
      `${siteUrl}/writing/retrieval-notes`
    );
    expect(publicEntryPath("writing", "retrieval-notes")).toBe(
      "/writing/retrieval-notes"
    );
    expect(publicEntryPath("music", "chopin-etude")).toBe(
      "/music/chopin-etude"
    );
    expect(publicProjectPath("gradus-ad-parnassum")).toBe(
      "/work#gradus-ad-parnassum"
    );
  });

  it("publishes safe Person JSON-LD with public contact and education facts", () => {
    const identity = createSiteIdentity(DEFAULT_PUBLIC_PROFILE);

    expect(identity.structuredData).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Pablo Pupo",
      url: siteUrl,
      jobTitle: "AI Engineer at Handtevy",
      email: "mailto:pablofpupo23@gmail.com",
      image: `${siteUrl}/media/pablo-pupo-portrait.jpg`,
      homeLocation: { "@type": "Place", name: "Miami, Florida" },
      affiliation: {
        "@type": "CollegeOrUniversity",
        name: "University of Florida",
      },
    });
    expect(identity.structuredData.description).toContain("December 2026");
    expect(identity.structuredData.sameAs).toEqual([
      "https://github.com/pablopupo",
      "https://linkedin.com/in/pablopupo",
    ]);
    expect(identity.structuredData.knowsAbout).not.toContain(
      "Open-source software"
    );
    expect(serializeJsonLd({ value: "</script>" })).toBe(
      '{"value":"\\u003c/script>"}'
    );
  });

  it("derives identity from UI-managed profile values and omits cleared facts", () => {
    const identity = createSiteIdentity({
      ...DEFAULT_PUBLIC_PROFILE,
      siteTitle: "Pablo's Notebook",
      headline: "Applied AI Engineer",
      location: null,
      graduationOn: null,
      contactEmail: null,
      githubUrl: "https://github.com/example",
      linkedinUrl: null,
      portraitUrl: "https://assets.example.com/pablo.webp",
    });

    expect(identity).toMatchObject({
      name: "Pablo's Notebook",
      headline: "Applied AI Engineer",
      email: null,
      location: null,
      graduationOn: null,
    });
    expect(identity.structuredData).not.toHaveProperty("email");
    expect(identity.structuredData).not.toHaveProperty("homeLocation");
    expect(identity.structuredData.description).not.toContain("graduation");
    expect(identity.structuredData.image).toBe(
      "https://assets.example.com/pablo.webp"
    );
    expect(identity.structuredData.sameAs).toEqual([
      "https://github.com/example",
    ]);
  });
});
