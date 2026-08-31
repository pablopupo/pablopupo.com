import type { Metadata } from "next";
import Link from "next/link";
import KnowledgeGraph from "@/components/knowledge-graph";
import MarkdownContent from "@/components/markdown-content";
import ProfileLinks from "@/components/profile-links";
import { PublicEntryList } from "@/components/public-entry-list";
import { ProjectList } from "@/components/public-work";
import { createPublicAlternates } from "@/lib/metadata";
import { getPublicEntries, getPublicProjects } from "@/lib/public-content";
import { getPublicGraph } from "@/lib/public-graph";
import { getPublicProfile } from "@/lib/public-profile";

export const revalidate = 60;

export const metadata: Metadata = {
  alternates: createPublicAlternates("/"),
};

export function selectSelectedProjects<T extends { featured: boolean }>(
  projects: T[]
) {
  return [
    ...projects.filter((project) => project.featured),
    ...projects.filter((project) => !project.featured),
  ].slice(0, 3);
}

export default async function Home() {
  const [profile, projects, entries] = await Promise.all([
    getPublicProfile(),
    getPublicProjects(),
    getPublicEntries(),
  ]);
  const writing = entries
    .filter((entry) => entry.section === "writing")
    .slice(0, 3);
  const music = entries
    .filter((entry) => entry.section === "music")
    .slice(0, 3);
  const graph = await getPublicGraph(projects, entries);

  return (
    <div className="home-page">
      <section className="home-introduction" aria-labelledby="home-title">
        <div className="hero">
          <Link
            href="/about"
            className="portrait-link"
            aria-label="About Pablo Pupo"
          >
            <div className="portrait-frame">
              <img
                src={profile.portraitUrl}
                alt={profile.portraitAlt}
                width={680}
                height={680}
                fetchPriority="high"
              />
            </div>
          </Link>
          <div className="hero-copy">
            <h1 id="home-title" className="visually-hidden">
              {profile.siteTitle}
            </h1>
            <MarkdownContent markdown={profile.introMarkdown} />
            <ProfileLinks profile={profile} />
          </div>
        </div>
        <div className="home-connections">
          <KnowledgeGraph data={graph} />
        </div>
      </section>

      <section className="home-section" aria-labelledby="selected-work-title">
        <div className="section-heading">
          <h2 id="selected-work-title">Selected work</h2>
          <Link href="/work">All work</Link>
        </div>
        <ProjectList projects={selectSelectedProjects(projects)} compact />
      </section>

      <section className="home-section" aria-labelledby="recent-writing-title">
        <div className="section-heading">
          <h2 id="recent-writing-title">Recent writing</h2>
          <Link href="/writing">All writing</Link>
        </div>
        <PublicEntryList
          entries={writing}
          emptyMessage="Writing is coming soon."
        />
      </section>

      <section className="home-section" aria-labelledby="recent-music-title">
        <div className="section-heading">
          <h2 id="recent-music-title">Recent music</h2>
          <Link href="/music">All music</Link>
        </div>
        <PublicEntryList entries={music} emptyMessage="Music is coming soon." />
      </section>
    </div>
  );
}
