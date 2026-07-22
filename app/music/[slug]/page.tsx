import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicEntryPage } from "@/components/public-entry-page";
import { createEntryMetadata } from "@/lib/metadata";
import { getPublicEntry } from "@/lib/public-content";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getPublicEntry(slug);
  if (!entry || entry.section !== "music") return {};
  return createEntryMetadata(entry);
}

export default async function MusicEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = await getPublicEntry(slug);
  if (!entry || entry.section !== "music") notFound();

  return <PublicEntryPage entry={entry} />;
}
