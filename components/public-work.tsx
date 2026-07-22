import MarkdownContent from "@/components/markdown-content";
import { shortRef, type Contribution } from "@/lib/contributions";
import type { PublicProject } from "@/lib/public-content";

function safeProjectUrl(value: string) {
  if (/^\/(?!\/)/.test(value)) return value;
  try {
    const url = new URL(value);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    ) {
      return value;
    }
  } catch {
    return null;
  }
  return null;
}

function projectDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function projectMetadata(project: PublicProject) {
  const dates = project.startedOn
    ? `${projectDate(project.startedOn)} to ${
        project.endedOn ? projectDate(project.endedOn) : "Present"
      }`
    : project.endedOn
      ? `Through ${projectDate(project.endedOn)}`
      : null;
  return [
    project.kind === "experience" ? "Experience" : "Project",
    project.organization,
    dates,
  ].filter((value): value is string => Boolean(value));
}

export function ProjectList({
  projects,
  compact = false,
}: {
  projects: PublicProject[];
  compact?: boolean;
}) {
  if (projects.length === 0) {
    return <p className="empty-state">Public work is being prepared.</p>;
  }

  return (
    <div className={`project-list${compact ? " project-list-compact" : ""}`}>
      {projects.map((project) => {
        const metadata = projectMetadata(project);
        const links = project.links.flatMap((link) => {
          const href = safeProjectUrl(link.url);
          return href ? [{ ...link, href }] : [];
        });
        return (
          <article className="project" id={project.slug} key={project.slug}>
            <div className="project-heading">
              <h3>{project.title}</h3>
              {project.technologies.length > 0 && (
                <p className="project-technologies">
                  {project.technologies.join(" · ")}
                </p>
              )}
            </div>
            <p className="project-meta">{metadata.join(" · ")}</p>
            {project.summary && (
              <p className="project-summary">{project.summary}</p>
            )}
            {!compact && <MarkdownContent markdown={project.bodyMarkdown} />}
            {compact && !project.summary && (
              <MarkdownContent markdown={project.bodyMarkdown} />
            )}
            {links.length > 0 && (
              <p className="project-links">
                {links.map((link) => (
                  <a href={link.href} key={`${project.slug}-${link.href}`}>
                    {link.label}
                  </a>
                ))}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function OpenSourceList({
  contributions,
  limit,
}: {
  contributions: Contribution[];
  limit?: number;
}) {
  const visible = limit ? contributions.slice(0, limit) : contributions;

  if (visible.length === 0) {
    return <p className="empty-state">Open-source work will appear here.</p>;
  }

  return (
    <ol className="oss-list">
      {visible.map((contribution) => (
        <li key={contribution.url}>
          <div>
            <a className="oss-ref" href={contribution.url}>
              {shortRef(contribution)}
            </a>
            <span className="oss-status">{contribution.status}</span>
          </div>
          <p>{contribution.title}</p>
        </li>
      ))}
    </ol>
  );
}
