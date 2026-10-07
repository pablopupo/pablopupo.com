import { notFound } from "next/navigation";
import { getPublicEntries, getPublicProjects } from "@/lib/public-content";
import { getPublicGraph } from "@/lib/public-graph";
import { buildHomeGraph } from "@/lib/home-graph";
import DesignPreview from "./preview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Design preview", robots: { index: false, follow: false } };

export default async function Preview() {
  if (process.env.NODE_ENV !== "development") notFound();
  const [entries, projects] = await Promise.all([getPublicEntries(), getPublicProjects()]);
  const graph = buildHomeGraph(await getPublicGraph(projects, entries), entries);
  const recording = entries.find((entry) => entry.kind === "performance" && entry.performance);
  const performances = Object.fromEntries(entries.flatMap((entry) => {
    const node = graph.nodes.find((node) => node.href === `/music/${entry.slug}`);
    return node && entry.performance ? [[node.id, { youtubeUrl: entry.performance.youtubeUrl, title: entry.title, label: entry.performance.composer === "Pablo Pupo" ? "Composition" : entry.performance.composer.split(" ").at(-1) }]] : [];
  }));
  return <DesignPreview graph={graph} recording={recording} performances={performances} />;
}
