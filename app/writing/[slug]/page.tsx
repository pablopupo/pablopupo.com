import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicEntryPage } from "@/components/public-entry-page";
import { createEntryMetadata } from "@/lib/metadata";
import {
  entryNeighbors,
  getPublicEntries,
  getPublicEntry,
} from "@/lib/public-content";

export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const entry = await getPublicEntry(slug);
  if (!entry || entry.section !== "writing") return {};
  return createEntryMetadata(entry);
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [entry, entries] = await Promise.all([
    getPublicEntry(slug),
    getPublicEntries(),
  ]);
  if (!entry || entry.section !== "writing") notFound();
  const neighbors = entryNeighbors(entries, entry);

  return <PublicEntryPage entry={entry} {...neighbors} />;
}
