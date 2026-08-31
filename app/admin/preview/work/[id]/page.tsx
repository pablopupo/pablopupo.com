import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminAccessState } from "@/app/admin/admin-shell";
import { loadAdminRouteState } from "@/app/admin/admin-route";
import { AdminPreviewFrame } from "@/components/admin-preview-frame";
import { ProjectList } from "@/components/public-work";
import { loadProjectPreview } from "@/lib/admin/project-preview";
import { createAdminProjectRepository } from "@/lib/admin/project-repository";
import { getDatabase } from "@/lib/db/client";

export const metadata: Metadata = {
  title: "Work preview",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const state = await loadAdminRouteState();
  if (state.mode !== "authorized") return <AdminAccessState state={state} />;

  const { id } = await params;
  const repository = createAdminProjectRepository(getDatabase());
  const preview = await loadProjectPreview(id, repository);
  if (!preview) notFound();

  const status = `${preview.status[0]?.toUpperCase()}${preview.status.slice(1)}`;
  return (
    <AdminPreviewFrame
      label={`${status} · ${preview.project.title}`}
      editorHref="/admin/work"
    >
      <ProjectList projects={[preview.project]} />
    </AdminPreviewFrame>
  );
}
