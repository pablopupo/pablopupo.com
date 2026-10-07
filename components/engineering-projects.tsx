import Link from "@/components/page-link";
import { projectDevelopment, projectExcerpt } from "@/lib/editorial";
import type { PublicProject } from "@/lib/public-content";
import { publicProjectPath } from "@/lib/site";
import MarkdownContent from "./markdown-content";
import { ProjectLinks } from "./home-projects";
import { BrandViewTransition, NamedViewTransition } from "./view-transition";
import AccordoLogo from "./accordo-logo";

export default function EngineeringProjects({ projects }: { projects: PublicProject[] }) {
  if (projects.length === 0) return null;
  return (
    <div className="engineering-projects">
      {projects.map((project) => {
        const development = projectDevelopment(project);
        return <article className="engineering-project" id={project.slug} key={project.slug}>
          {project.slug === "accordo" ? <h3 className="engineering-project-brand"><Link href={publicProjectPath(project.slug)} transitionTypes={["project"]}><BrandViewTransition><AccordoLogo /></BrandViewTransition></Link></h3> : <NamedViewTransition name={`project-${project.slug}`}>
            <h3><Link href={publicProjectPath(project.slug)}>{project.title}</Link></h3>
          </NamedViewTransition>}
          <p className="engineering-project-summary">{projectExcerpt(project)}</p>
          {development && <MarkdownContent className="engineering-project-credit" markdown={development} />}
          {project.technologies.length > 0 && <p className="engineering-project-technologies">{project.technologies.join(" · ")}</p>}
          <ProjectLinks project={project} />
        </article>;
      })}
    </div>
  );
}
