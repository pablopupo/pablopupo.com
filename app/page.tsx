import type { Metadata } from "next";
import KnowledgeGraph from "@/components/knowledge-graph";
import MarkdownContent from "@/components/markdown-content";
import { PublicEntryList } from "@/components/public-entry-list";
import { OpenSourceList, ProjectList } from "@/components/public-work";
import { getLiveContributions } from "@/lib/github-status";
import { createPublicAlternates } from "@/lib/metadata";
import { getPublicEntries, getPublicProjects } from "@/lib/public-content";
import { buildPublicGraph } from "@/lib/public-graph";
import { getPublicProfile } from "@/lib/public-profile";

export const revalidate = 60;

export const metadata: Metadata = {
  alternates: createPublicAlternates("/"),
};

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

export function selectSelectedProjects<T extends { featured: boolean }>(
  projects: T[]
) {
  return [
    ...projects.filter((project) => project.featured),
    ...projects.filter((project) => !project.featured),
  ].slice(0, 3);
}

export default async function Home() {
  const [profile, projects, entries, contributions] = await Promise.all([
    getPublicProfile(),
    getPublicProjects(),
    getPublicEntries(),
    getLiveContributions(),
  ]);
  const writing = entries
    .filter((entry) => entry.section === "writing")
    .slice(0, 3);
  const music = entries
    .filter((entry) => entry.section === "music")
    .slice(0, 3);
  const graph = buildPublicGraph(projects, entries);
  const graduation = graduationLabel(profile.graduationOn);

  return (
    <div className="home-page">
      <section className="hero" aria-labelledby="home-title">
        <div className="portrait-frame">
          <img
            src={profile.portraitUrl}
            alt={profile.portraitAlt}
            width={680}
            height={680}
            fetchPriority="high"
          />
        </div>
        <div className="hero-copy">
          <p className="eyebrow">{profile.siteTitle}</p>
          <h1 id="home-title">{profile.headline}</h1>
          <MarkdownContent markdown={profile.introMarkdown} />
          <dl className="profile-facts">
            {profile.location && (
              <div>
                <dt>Based in</dt>
                <dd>{profile.location}</dd>
              </div>
            )}
            {graduation && (
              <div>
                <dt>Graduation</dt>
                <dd>{graduation}</dd>
              </div>
            )}
          </dl>
          <p className="profile-links">
            <a href="/resume">Resume</a>
            {profile.contactEmail && (
              <a href={`mailto:${profile.contactEmail}`}>Email</a>
            )}
            {profile.githubUrl && <a href={profile.githubUrl}>GitHub</a>}
            {profile.linkedinUrl && <a href={profile.linkedinUrl}>LinkedIn</a>}
          </p>
        </div>
      </section>

      <section className="graph-section" aria-labelledby="connections-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Explore</p>
            <h2 id="connections-title">Knowledge graph</h2>
          </div>
          <p>
            Projects, technical notes, music, and the ideas connecting them.
          </p>
        </div>
        <KnowledgeGraph data={graph} />
      </section>

      <section className="home-section" aria-labelledby="selected-work-title">
        <div className="section-heading">
          <h2 id="selected-work-title">Selected work</h2>
          <a href="/work">All work</a>
        </div>
        <ProjectList projects={selectSelectedProjects(projects)} compact />
      </section>

      <section className="home-section" aria-labelledby="recent-writing-title">
        <div className="section-heading">
          <h2 id="recent-writing-title">Recent writing</h2>
          <a href="/writing">All writing</a>
        </div>
        <PublicEntryList
          entries={writing}
          emptyMessage="Writing is coming soon."
        />
      </section>

      <section className="home-section" aria-labelledby="recent-music-title">
        <div className="section-heading">
          <h2 id="recent-music-title">Recent music</h2>
          <a href="/music">All music</a>
        </div>
        <PublicEntryList entries={music} emptyMessage="Music is coming soon." />
      </section>

      <section className="home-section" aria-labelledby="open-source-title">
        <div className="section-heading">
          <h2 id="open-source-title">Open source</h2>
          <a href="/work#open-source">All contributions</a>
        </div>
        <OpenSourceList contributions={contributions} limit={3} />
      </section>
    </div>
  );
}
