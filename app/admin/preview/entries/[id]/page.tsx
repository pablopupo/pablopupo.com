import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AdminPreviewFrame } from "@/components/admin-preview-frame";
import { PublicEntryPage } from "@/components/public-entry-page";
import { loadAdminEntryPreview } from "@/lib/admin/entry-preview";
import { AdminAccessState } from "@/app/admin/admin-shell";
import { loadAdminRouteState } from "@/app/admin/admin-route";

export const metadata: Metadata = {
  title: "Entry preview",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const entryIdSchema = z.uuid();

export default async function EntryPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const state = await loadAdminRouteState();
  if (state.mode !== "authorized") return <AdminAccessState state={state} />;

  const { id } = await params;
  const parsedId = entryIdSchema.safeParse(id);
  if (!parsedId.success) notFound();

  const preview = await loadAdminEntryPreview(parsedId.data);
  if (!preview) notFound();

  const status = `${preview.status[0]?.toUpperCase()}${preview.status.slice(1)}`;
  return (
    <AdminPreviewFrame
      label={`${status} · ${preview.entry.title}`}
      editorHref="/admin"
    >
      <PublicEntryPage entry={preview.entry} preview />
    </AdminPreviewFrame>
  );
}
