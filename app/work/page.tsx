import type { Metadata } from "next";
import { OpenSourceList, ProjectList } from "@/components/public-work";
import { getLiveContributions } from "@/lib/github-status";
import { createPageMetadata } from "@/lib/metadata";
import { getPublicProjects } from "@/lib/public-content";

export const metadata: Metadata = createPageMetadata({
  title: "Work",
  description: "Projects and open-source contributions by Pablo Pupo.",
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
      <header className="page-header">
        <p className="eyebrow">Software</p>
        <h1>Work</h1>
        <p>
          Applied AI projects, experiments, and contributions to tools I use.
        </p>
      </header>

      <section aria-labelledby="projects-title">
        <div className="section-heading">
          <h2 id="projects-title">Projects</h2>
        </div>
        <ProjectList projects={projects} />
      </section>

      <section
        className="index-section"
        id="open-source"
        aria-labelledby="oss-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Public record</p>
            <h2 id="oss-title">Open source</h2>
          </div>
        </div>
        <OpenSourceList contributions={contributions} />
      </section>
    </div>
  );
}
