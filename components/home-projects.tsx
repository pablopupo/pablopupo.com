import Link from "@/components/page-link";
import { safeProjectUrl } from "./public-work";
import { projectExcerpt } from "@/lib/editorial";
import { externalLinkProps } from "@/lib/links";
import type { PublicProject } from "@/lib/public-content";
import { publicProjectPath } from "@/lib/site";
import { NamedViewTransition } from "./view-transition";

export function ProjectLinks({ project }: { project: PublicProject }) {
  const live = project.links.find((link) => link.kind === "live" && safeProjectUrl(link.url));
  const repository = project.links.find((link) => link.kind === "repository" && safeProjectUrl(link.url));
  return <div className="home-project-links">
    <Link href={publicProjectPath(project.slug)} transitionTypes={project.slug === "accordo" ? ["project"] : undefined}>View project<span className="visually-hidden">: {project.title}</span></Link>
    {live && <a href={live.url} {...externalLinkProps(live.url)}>Open app<span className="visually-hidden">: {project.title} (new tab)</span><span aria-hidden="true"> ↗</span></a>}
    {repository && <a href={repository.url} {...externalLinkProps(repository.url)}>GitHub<span className="visually-hidden">: {project.title} (new tab)</span><span aria-hidden="true"> ↗</span></a>}
  </div>;
}

export default function HomeProjects({ projects }: { projects: PublicProject[] }) {
  // Feature a project visitors can try, while respecting the featured selection.
  const lead = projects.find((project) => project.links.some((link) => link.kind === "live" && safeProjectUrl(link.url))) ?? projects[0];
  if (!lead) return null;
  const rest = projects.filter((project) => project.slug !== lead.slug);
  return <div className="home-projects">
    <article className="home-project-lead">
      <div className="home-project-copy">
        <NamedViewTransition name={`project-${lead.slug}`}>
          <h3><Link href={publicProjectPath(lead.slug)}>{lead.title}</Link></h3>
        </NamedViewTransition>
        <p className="home-project-summary">{projectExcerpt(lead)}</p>
        <ProjectLinks project={lead} />
      </div>
    </article>
    {rest.length > 0 && <div className="home-project-more">{rest.map((project) => <article key={project.slug}>
      <NamedViewTransition name={`project-${project.slug}`}>
        <h3><Link href={publicProjectPath(project.slug)}>{project.title}</Link></h3>
      </NamedViewTransition>
      <p className="home-project-summary">{projectExcerpt(project)}</p>
      <ProjectLinks project={project} />
    </article>)}</div>}
  </div>;
}
