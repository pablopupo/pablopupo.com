import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PostSeriesPage from "@/components/post-series-page";
import { getPublicEntries } from "@/lib/public-content";
import { createPageMetadata } from "@/lib/metadata";
import { collectSeries, seriesPath } from "@/lib/series";

export const revalidate = 60;
type Props = { params: Promise<{ slug: string }> };
async function findSeries(slug: string) {
  return collectSeries(await getPublicEntries()).find((series) => series.section === "writing" && series.slug === slug);
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const series = await findSeries((await params).slug);
  return series ? createPageMetadata({ title: series.title, description: `Posts from ${series.title} by Pablo Pupo.`, canonical: seriesPath(series) }) : {};
}
export default async function WritingSeries({ params }: Props) {
  const series = await findSeries((await params).slug);
  if (!series) notFound();
  return <PostSeriesPage series={series} />;
}
