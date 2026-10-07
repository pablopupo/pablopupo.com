import type { Metadata } from "next";
import PageCopyText from "@/components/page-copy-text";
import Link from "@/components/page-link";
import PostSeriesList from "@/components/post-series-list";
import { collectSeries } from "@/lib/series";
import EngineeringProjects from "@/components/engineering-projects";
import OpenSourceNote from "@/components/open-source-note";
import { ProjectList } from "@/components/public-work";
import { WritingPreviewList } from "@/components/home-writing";
import { isTechnicalEntry } from "@/lib/editorial";
import { createPageMetadata } from "@/lib/metadata";
import { getPublicEntries, getPublicProjects } from "@/lib/public-content";
import { getPublicProfile } from "@/lib/public-profile";

export const metadata: Metadata = createPageMetadata({ title: "Engineering", description: "AI and software projects, experiments, and technical notes by Pablo Pupo.", canonical: "/work" });
export const revalidate = 60;

export default async function Engineering() {
  const [projects, entries, profile] = await Promise.all([getPublicProjects(), getPublicEntries(), getPublicProfile()]);
  const personalProjects = projects.filter((project) => project.kind === "project");
  const experience = projects.filter((project) => project.kind === "experience");
  const notes = entries.filter(isTechnicalEntry);
  const hasProjects = personalProjects.length > 0 || experience.length > 0;
  return (
    <div className="editorial-page engineering-page">
      <header className="editorial-header">
        <h1>Engineering</h1>
        <PageCopyText text={profile.pageCopy.engineeringIntro} />
        <div className="engineering-intro-links">
          <a href="/resume" target="_blank" rel="noopener noreferrer">View resume <span aria-hidden="true">↗</span></a>
          {profile.githubUrl && <a href={profile.githubUrl} target="_blank" rel="noopener noreferrer">GitHub <span aria-hidden="true">↗</span></a>}
        </div>
      </header>
      {hasProjects && notes.length > 0 && <nav className="engineering-section-nav" aria-label="Engineering sections">
        <a href="#projects">Projects</a>
        <a href="#technical-notes">Notes</a>
      </nav>}
      {hasProjects && <section id="projects" className="engineering-section" aria-labelledby="projects-title">
        <div className="engineering-section-heading"><h2 id="projects-title">Projects</h2></div>
        <EngineeringProjects projects={personalProjects} />
        {experience.length > 0 && <section className="experience-section" aria-label="Engineering experience"><h3>Experience</h3><ProjectList projects={experience} compact /></section>}
      </section>}
      {notes.length > 0 && <section id="technical-notes" className="engineering-section engineering-notes" aria-labelledby="technical-notes-title">
        <div className="engineering-section-heading"><h2 id="technical-notes-title">Engineering notes</h2><Link href="/work/notes">All notes</Link></div>
        <WritingPreviewList entries={notes.slice(0, 3)} />
      </section>}
      <PostSeriesList series={collectSeries(notes)} />
      <OpenSourceNote />
    </div>
  );
}
