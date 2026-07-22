import type { PublicProfile } from "./public-profile";
import { DEFAULT_PUBLIC_PROFILE } from "./public-profile";

export const siteUrl = "https://pablopupo.com";
export const siteTitle = DEFAULT_PUBLIC_PROFILE.siteTitle;

export function absoluteSiteUrl(path: string) {
  if (path === "" || path === "/") return siteUrl;
  return new URL(path, `${siteUrl}/`).toString();
}

export function publicEntryPath(
  section: "writing" | "music",
  slug: string
) {
  return `/${section}/${slug}`;
}

export function publicProjectPath(slug: string) {
  return `/work#${slug}`;
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function createProfileDescription(profile: PublicProfile) {
  return `${profile.headline}. Writing about applied AI, software engineering, open source, and classical piano.`;
}

function graduationLabel(graduationOn: string) {
  const [year, month] = graduationOn.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return graduationOn;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function createSiteIdentity(profile: PublicProfile) {
  const description = [
    createProfileDescription(profile),
    profile.graduationOn
      ? `Computer science student at the University of Florida with expected graduation in ${graduationLabel(profile.graduationOn)}.`
      : "Computer science student at the University of Florida.",
  ].join(" ");
  const sameAs = [
    profile.githubUrl,
    profile.linkedinUrl,
    profile.youtubeUrl,
  ].filter((url): url is string => url !== null);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.siteTitle,
    url: siteUrl,
    jobTitle: profile.headline,
    description,
    image: absoluteSiteUrl(profile.portraitUrl),
    affiliation: {
      "@type": "CollegeOrUniversity",
      name: "University of Florida",
    },
    knowsAbout: [
      "Applied artificial intelligence",
      "Software engineering",
      "Open-source software",
      "Classical piano",
    ],
    ...(profile.contactEmail
      ? { email: `mailto:${profile.contactEmail}` }
      : {}),
    ...(profile.location
      ? { homeLocation: { "@type": "Place", name: profile.location } }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };

  return {
    name: profile.siteTitle,
    headline: profile.headline,
    email: profile.contactEmail,
    location: profile.location,
    graduationOn: profile.graduationOn,
    githubUrl: profile.githubUrl,
    linkedinUrl: profile.linkedinUrl,
    youtubeUrl: profile.youtubeUrl,
    portraitUrl: profile.portraitUrl,
    portraitAlt: profile.portraitAlt,
    resumeUrl: profile.resumeUrl,
    description: createProfileDescription(profile),
    structuredData,
  };
}

export const siteDescription = createProfileDescription(DEFAULT_PUBLIC_PROFILE);
