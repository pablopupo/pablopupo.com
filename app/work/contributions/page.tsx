import type { Metadata } from "next";
import BackLink from "@/components/back-link";
import EngineeringContributions from "@/components/engineering-contributions";
import { getLiveContributions } from "@/lib/github-status";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Open source",
  description: "Open-source contributions by Pablo Pupo.",
  canonical: "/work/contributions",
});
export const revalidate = 60;

export default async function Contributions() {
  const contributions = await getLiveContributions();

  return <div className="editorial-page contributions-page">
    <header className="editorial-header">
      <BackLink href="/work" label="engineering" />
      <h1>Open source</h1>
    </header>
    <EngineeringContributions contributions={contributions} />
  </div>;
}
