import type { Metadata } from "next";
import { PublicEntryList } from "@/components/public-entry-list";
import { createPageMetadata } from "@/lib/metadata";
import { getPublicEntries } from "@/lib/public-content";

export const metadata: Metadata = createPageMetadata({
  title: "Writing",
  description:
    "Technical notes and essays on applied AI, software engineering, and systems.",
  canonical: "/writing",
});

export const revalidate = 60;

export default async function Writing() {
  const entries = (await getPublicEntries()).filter(
    (entry) => entry.section === "writing"
  );

  return (
    <div className="public-index reading-shell">
      <header className="page-header section-index-header">
        <p className="eyebrow">Notes and essays</p>
        <h1>Writing</h1>
        <p>
          Technical notes on applied AI, software engineering, and what I am
          learning while building.
        </p>
      </header>
      <PublicEntryList
        entries={entries}
        emptyMessage="No writing published yet."
      />
    </div>
  );
}
