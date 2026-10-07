import type { Metadata } from "next";
import Image from "next/image";
import CopyEmail from "@/components/copy-email";
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
    <article className="editorial-page about-story">
      <header className="editorial-header about-header">
        <h1>About</h1>
        <a href="/resume" target="_blank" rel="noopener noreferrer">View resume <span aria-hidden="true">↗</span></a>
      </header>
      <div className="about-content">
        <figure className="about-portrait">
          <Image src={profile.portraitUrl} alt={profile.portraitAlt} width={480} height={600} sizes="(max-width: 600px) 160px, 240px" unoptimized={profile.portraitUrl.startsWith("http")} />
          <figcaption><span>{profile.siteTitle}</span>{profile.location && <span>{profile.location}</span>}</figcaption>
        </figure>
        <div className="about-biography">
          <MarkdownContent markdown={profile.aboutMarkdown} />
        </div>
      </div>
      <div className="about-details">
        <section aria-labelledby="about-education">
          <h2 id="about-education">Education</h2>
          {profile.pageCopy.aboutSchool && <p>{profile.pageCopy.aboutSchool}</p>}
          <p className="about-detail-note">{profile.pageCopy.aboutStudy}{graduation ? <><br />Expected graduation: {graduation}</> : null}</p>
        </section>
        {(profile.linkedinUrl || profile.contactEmail) && <section aria-labelledby="about-contact">
          <h2 id="about-contact">Say hello</h2>
          <div className="about-contact-links">
            {profile.linkedinUrl && <a href={profile.linkedinUrl} target="_blank" rel="noopener noreferrer">LinkedIn <span aria-hidden="true">↗</span></a>}
            {profile.contactEmail && <CopyEmail email={profile.contactEmail} label="Copy email" />}
          </div>
        </section>}
      </div>
    </article>
  );
}
