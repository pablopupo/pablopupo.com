import { getPublicEntries, getPublicProjects } from "@/lib/public-content";
import { getPublicGraph } from "@/lib/public-graph";
import { buildHomeGraph } from "@/lib/home-graph";

export async function GET() {
  const [entries, projects] = await Promise.all([getPublicEntries(), getPublicProjects()]);
  const graph = buildHomeGraph(await getPublicGraph(projects, entries), entries);
  return Response.json(graph, { headers: { "Cache-Control": "no-store" } });
}
