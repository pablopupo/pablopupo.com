import { cache } from "react";
import type { Metadata } from "next";
import Link from "@/components/page-link";
import { externalLinkProps } from "@/lib/links";
import { notFound, permanentRedirect } from "next/navigation";
import MarkdownContent from "@/components/markdown-content";
import BackLink from "@/components/back-link";
import { PublicEntryList } from "@/components/public-entry-list";
import { safeProjectUrl } from "@/components/public-work";
import { createPageMetadata } from "@/lib/metadata";
import { projectExcerpt } from "@/lib/editorial";
import { getPublicEntries, getPublicProjects } from "@/lib/public-content";
import { publicProjectPath } from "@/lib/site";
import { NamedViewTransition } from "@/components/view-transition";

type Props = { params: Promise<{ slug: string }> };
export const revalidate = 60;
const findProject = cache(async (slug: string) => (await getPublicProjects()).find((project) => project.slug === slug));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const project = await findProject(slug);
  if (!project) return { title: "Project not found", robots: { index: false } };
  return createPageMetadata({ title: project.title, description: projectExcerpt(project), canonical: publicProjectPath(project.slug) });
}

export default async function Project({ params }: Props) {
  const { slug } = await params;
  if (slug === "accordo") permanentRedirect("/accordo");
  const project = await findProject(slug);
  if (!project) notFound();
  const entries = await getPublicEntries();
  const related = entries.filter((entry) => entry.kind !== "performance" && entry.tags.some((tag) => tag.toLowerCase() === project.slug || tag.toLowerCase() === project.title.toLowerCase()));
  const links = project.links.flatMap((link) => {
    const url = safeProjectUrl(link.url);
    return url ? [{ ...link, url }] : [];
  });
  return <article className="editorial-page case-study reading-shell">
    <BackLink href="/work" label="engineering" />
    <header className="editorial-header"><p className="editorial-label">{project.kind === "experience" ? "Experience" : "Project"}{project.organization ? ` · ${project.organization}` : ""}</p><NamedViewTransition name={`project-${project.slug}`}><h1>{project.title}</h1></NamedViewTransition>{project.summary && <p>{project.summary}</p>}{project.technologies.length > 0 && <div className="case-technologies">{project.technologies.join(" · ")}</div>}</header>
    <MarkdownContent markdown={project.bodyMarkdown} />
    {links.length > 0 && <nav className="case-links editorial-links" aria-label="Project links">{links.map((link) => <a href={link.url} {...externalLinkProps(link.url)} key={link.url}>{link.label}</a>)}</nav>}
    {related.length > 0 && <section className="editorial-section" aria-labelledby="related-writing"><h2 id="related-writing">Notes on this project</h2><PublicEntryList entries={related} emptyMessage="" /></section>}
    <footer className="editorial-contact"><Link href="/work">More engineering work</Link><Link href="/about">About Pablo</Link></footer>
  </article>;
}
