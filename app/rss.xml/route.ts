import { createRssFeed } from "@/lib/feed";
import { getPublicEntries } from "@/lib/public-content";
import { getPublicProfile } from "@/lib/public-profile";

export const revalidate = 60;

export async function GET() {
  const [entries, profile] = await Promise.all([
    getPublicEntries(),
    getPublicProfile(),
  ]);
  const feedEntries = entries.filter(
    (entry) => entry.section === "writing" || entry.section === "music"
  );

  return new Response(createRssFeed(feedEntries, profile), {
    headers: {
      "Cache-Control": "public, s-maxage=60, must-revalidate",
      "Content-Type": "application/rss+xml; charset=utf-8",
    },
  });
}
