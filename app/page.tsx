import type { Metadata } from "next";
import Link from "@/components/page-link";
import { buildHomeGraph } from "@/lib/home-graph";
import KnowledgeGraph from "@/components/knowledge-graph";
import MarkdownContent from "@/components/markdown-content";
import PageCopyText from "@/components/page-copy-text";
import ProfileLinks from "@/components/profile-links";
import AccordoLogo from "@/components/accordo-logo";
import RecordingFeature from "@/components/recording-feature";
import HomeProjects from "@/components/home-projects";
import OpenSourceNote from "@/components/open-source-note";
import HomeWriting from "@/components/home-writing";
import { linkedInContactUrl } from "@/lib/links";
import { PublicEntryList } from "@/components/public-entry-list";
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
    .filter((entry) => entry.kind !== "performance")
    .slice(0, 3);
  const music = entries.filter((entry) => entry.section === "music");
  const introMarkdown = profile.introMarkdown.replace(/(Classical pianist\.)[ \t]+(?=Studying)/, "$1  \n");
  const graph = buildHomeGraph(await getPublicGraph(projects, entries), entries);
  const featuredPerformances = music.filter((entry) => entry.kind === "performance" && entry.performance).slice(0, 2);

  const performances = music.flatMap((entry) =>
    entry.performance ? [{ entry, performance: entry.performance }] : []
  );
  const composerCounts = new Map<string, number>();
  for (const { performance } of performances) {
    composerCounts.set(performance.composer, (composerCounts.get(performance.composer) ?? 0) + 1);
  }
  const performancePreviews = Object.fromEntries(performances.map(({ entry, performance }) => [
    graph.nodes.find((node) => node.href === `/music/${entry.slug}`)?.id ?? `entry:music:${entry.slug}`,
    {
      youtubeUrl: performance.youtubeUrl,
      title: entry.title,
      label: (composerCounts.get(performance.composer) ?? 0) > 1
        ? entry.title
        : performance.composer === profile.siteTitle
          ? "Composition"
          : performance.composer.split(" ").at(-1) ?? entry.title,
    },
  ]));

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
            <h1 id="home-title">
              {profile.siteTitle}
            </h1>
            <MarkdownContent markdown={introMarkdown} />
            <div className="hero-actions">
              <a className="text-button" href="/resume" target="_blank" rel="noopener noreferrer">View resume</a>
              <a href={linkedInContactUrl} target="_blank" rel="noopener noreferrer">Get in touch</a>
            </div>
            <ProfileLinks profile={profile} />
          </div>
        </div>
      </section>

      <div className="career-paths">
        <section className="career-path" aria-labelledby="engineering-title">
          <h2 id="engineering-title">AI & Software</h2>
          <PageCopyText text={profile.pageCopy.homeEngineeringIntro} />
          <Link href="/work" transitionTypes={["from-home", "home-engineering"]}>Explore my engineering work</Link>
        </section>
        <section className="career-path" aria-labelledby="music-title">
          <h2 id="music-title">Music</h2>
          <PageCopyText text={profile.pageCopy.homeMusicIntro} />
          <Link href="/music" transitionTypes={["from-home", "home-music"]}>Explore my music</Link>
        </section>
      </div>

      <section className="home-accordo" aria-labelledby="home-accordo-title">
        <div>
          <PageCopyText className="editorial-label" text={profile.pageCopy.homeAccordoEyebrow} />
          <h2 id="home-accordo-title"><span className="visually-hidden">Building </span><Link className="accordo-logo-link" href="/accordo" transitionTypes={["from-home", "home-accordo"]}><AccordoLogo /></Link></h2>
        </div>
        <div><PageCopyText text={profile.pageCopy.homeAccordoIntro} /><Link href="/accordo" transitionTypes={["from-home", "home-accordo"]}>The story behind Accordo</Link></div>
      </section>

      <div className="home-connections">
        <KnowledgeGraph
          data={graph}
          hubStyle="rings"
          performances={performancePreviews}
        />
      </div>

      {music.length > 0 && (
        <section className="home-section" aria-labelledby="recent-music-title">
          <div className="section-heading">
            <h2 id="recent-music-title">Recordings</h2>
            <Link href="/music">All music</Link>
          </div>
          {featuredPerformances.length > 0 ? <div className="home-recordings">{featuredPerformances.map((entry) => <RecordingFeature key={entry.slug} entry={entry} layout="split" />)}</div> : <PublicEntryList
            headingLevel={3}
            entries={music.slice(0, 3)}
            emptyMessage=""
          />}
        </section>
      )}

      <section className="home-section" aria-labelledby="selected-work-title">
        <div className="section-heading">
          <h2 id="selected-work-title">Projects</h2>
          <Link href="/work">All engineering</Link>
        </div>
        <HomeProjects projects={selectSelectedProjects(projects)} />
        <OpenSourceNote />
      </section>

      {writing.length > 0 && <HomeWriting entries={writing} />}
    </div>
  );
}
