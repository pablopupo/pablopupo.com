import type { Metadata } from "next";
import Link from "next/link";
import MarkdownContent from "@/components/markdown-content";
import { createPageMetadata } from "@/lib/metadata";
import { getPublicProfile } from "@/lib/public-profile";

export const metadata: Metadata = createPageMetadata({
  title: "About",
  description:
    "About Pablo Pupo, a University of Florida computer science student, AI engineer at Handtevy, and classical pianist.",
  canonical: "/about",
});

export const revalidate = 60;

function graduationLabel(value: string | null) {
  if (!value) return null;
  const [year, month] = value.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export default async function About() {
  const profile = await getPublicProfile();
  const graduation = graduationLabel(profile.graduationOn);

  return (
    <article className="about-page reading-shell">
      <header className="page-header">
        <p className="eyebrow">{profile.siteTitle}</p>
        <h1>About</h1>
        <p className="about-headline">{profile.headline}</p>
      </header>

      <section aria-labelledby="applied-ai-title">
        <h2 id="applied-ai-title">Applied AI</h2>
        <MarkdownContent markdown={profile.aboutMarkdown} />
        <p>
          I am learning more about AI systems, especially inference, serving,
          runtime behavior, performance, reliability, and evaluation. I
          publish notes here as I turn that study into working systems.
        </p>
      </section>

      <section aria-labelledby="music-about-title">
        <h2 id="music-about-title">Music</h2>
        <p>
          I am a classical pianist. I share piano performances, practice notes,
          and writing about the music I study.
        </p>
      </section>

      <section aria-labelledby="education-title">
        <h2 id="education-title">Education</h2>
        <p>
          I study computer science at the University of Florida
          {graduation ? ` and expect to graduate in ${graduation}` : ""}.
          {profile.location ? ` I am based in ${profile.location}.` : ""}
        </p>
      </section>

      <section aria-labelledby="contact-title">
        <h2 id="contact-title">Contact</h2>
        <p className="profile-links">
          <Link href="/resume">Resume</Link>
          {profile.contactEmail && (
            <a href={`mailto:${profile.contactEmail}`}>Email</a>
          )}
          {profile.githubUrl && <a href={profile.githubUrl}>GitHub</a>}
          {profile.linkedinUrl && <a href={profile.linkedinUrl}>LinkedIn</a>}
        </p>
      </section>
    </article>
  );
}
