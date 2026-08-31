import type { Metadata } from "next";
import { OpenSourceList, ProjectList } from "@/components/public-work";
import { getLiveContributions } from "@/lib/github-status";
import { createPageMetadata } from "@/lib/metadata";
import { getPublicProjects } from "@/lib/public-content";

export const metadata: Metadata = createPageMetadata({
  title: "Work",
  description: "Applied AI projects and software work by Pablo Pupo.",
  canonical: "/work",
});

export const revalidate = 60;

export default async function Work() {
  const [projects, contributions] = await Promise.all([
    getPublicProjects(),
    getLiveContributions(),
  ]);

  return (
    <div className="public-index">
      <header className="page-header section-index-header">
        <p className="eyebrow">Software</p>
        <h1>Work</h1>
        <p>Applied AI projects, experiments, and systems I’ve worked on.</p>
      </header>

      <section aria-labelledby="projects-title">
        <div className="section-heading">
          <h2 id="projects-title">Projects and experience</h2>
        </div>
        <ProjectList projects={projects} />
      </section>

      <section
        className="index-section"
        id="open-source"
        aria-labelledby="contributions-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Elsewhere</p>
            <h2 id="contributions-title">Contributions</h2>
          </div>
        </div>
        <OpenSourceList contributions={contributions} />
      </section>
    </div>
  );
}
