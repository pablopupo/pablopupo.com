import type { PublicProject } from "../public-content";
import { z } from "zod";

export type ProjectPreviewRecord = {
  id: string;
  slug: string;
  kind: "project" | "experience";
  status: "draft" | "scheduled" | "published" | "archived";
  title: string;
  organization: string | null;
  summary: string | null;
  bodyMarkdown: string;
  coverMediaId: string | null;
  startedOn: string | null;
  endedOn: string | null;
  publishedAt: Date | string | null;
  sortOrder: number;
  featured: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  technologies: string[];
  links: Array<{
    kind: "repository" | "live" | "demo" | "writeup" | "other";
    label: string;
    url: string;
    sortOrder: number;
  }>;
};

export type ProjectPreviewRepository = {
  getProject: (
    id: string
  ) => Promise<ProjectPreviewRecord | undefined>;
};

export type AdminProjectPreview = {
  status: ProjectPreviewRecord["status"];
  project: PublicProject;
};

const projectIdSchema = z.uuid();

function isoDate(value: Date | string) {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}

export function projectPreview(record: ProjectPreviewRecord): PublicProject {
  return {
    id: record.id,
    slug: record.slug,
    kind: record.kind,
    title: record.title,
    organization: record.organization,
    summary: record.summary,
    bodyMarkdown: record.bodyMarkdown,
    startedOn: record.startedOn,
    endedOn: record.endedOn,
    publishedAt: isoDate(record.publishedAt ?? record.updatedAt),
    featured: record.featured,
    technologies: [...record.technologies],
    links: [...record.links]
      .sort(
        (left, right) =>
          left.sortOrder - right.sortOrder || left.label.localeCompare(right.label)
      )
      .map(({ kind, label, url }) => ({ kind, label, url })),
  };
}

export async function loadProjectPreview(
  id: string,
  repository: ProjectPreviewRepository
) {
  const parsed = projectIdSchema.safeParse(id);
  if (!parsed.success) return null;
  const record = await repository.getProject(parsed.data);
  return record
    ? { status: record.status, project: projectPreview(record) }
    : null;
}
