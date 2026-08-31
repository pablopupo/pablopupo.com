type ProjectGraphSource = {
  id: string;
  slug: string;
  title: string;
  summary?: string | null;
};

type EntryGraphSource = {
  id: string;
  slug: string;
  section: "writing" | "music";
  title: string;
  summary?: string | null;
};

export function projectGraphSnapshot(project: ProjectGraphSource) {
  return {
    key: `project:${project.id}`,
    projectId: project.id,
    label: project.title,
    kind: "project" as const,
    href: `/work#${project.slug}`,
    body: project.summary ?? "",
    origin: "automatic" as const,
  };
}

export function entryGraphSnapshot(entry: EntryGraphSource) {
  return {
    key: `entry:${entry.id}`,
    entryId: entry.id,
    label: entry.title,
    kind: entry.section,
    href: `/${entry.section}/${entry.slug}`,
    body: entry.summary ?? "",
    origin: "automatic" as const,
  };
}
