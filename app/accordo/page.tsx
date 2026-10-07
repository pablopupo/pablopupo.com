import type { Metadata } from "next";
import PageCopyText from "@/components/page-copy-text";
import Link from "@/components/page-link";
import AccordoLogo from "@/components/accordo-logo";
import { BrandViewTransition } from "@/components/view-transition";
import { PublicEntryList } from "@/components/public-entry-list";
import { createPageMetadata } from "@/lib/metadata";
import { getPublicEntries } from "@/lib/public-content";
import { getPublicProfile } from "@/lib/public-profile";

export const metadata: Metadata = createPageMetadata({
  title: "Accordo",
  description: "Accordo is a platform Pablo Pupo is building to connect musicians with one another and with opportunities.",
  canonical: "/accordo",
});
export const revalidate = 60;

export default async function Accordo() {
  const [profile, entries] = await Promise.all([getPublicProfile(), getPublicEntries()]);
  const copy = profile.pageCopy;
  const notes = entries.filter((entry) => entry.kind !== "performance" && entry.tags.some((tag) => tag.toLowerCase() === "accordo"));
  return <div className="editorial-page accordo-page">
    <header className="editorial-header accordo-header"><BrandViewTransition><AccordoLogo /></BrandViewTransition><PageCopyText className="editorial-label" text={copy.accordoEyebrow} /><h1 style={{ whiteSpace: "pre-line" }}>{copy.accordoTitle}</h1><PageCopyText text={copy.accordoIntro} /></header>
    <div className="editorial-split">
      <section className="founder-letter" aria-labelledby="accordo-why"><h2 id="accordo-why">{copy.accordoStoryTitle}</h2><PageCopyText text={copy.accordoStory} />{profile.contactEmail && <a className="editorial-link" href={`mailto:${profile.contactEmail}?subject=Accordo`}>Talk with me about Accordo <span aria-hidden="true">↗</span></a>}</section>
      <aside className="editorial-aside"><PageCopyText className="editorial-label" text={copy.accordoAsideEyebrow} /><h2 style={{ whiteSpace: "pre-line" }}>{copy.accordoAsideTitle}</h2><PageCopyText text={copy.accordoAsideIntro} /><div className="editorial-links"><Link href="/music">Listen to my music</Link><Link href="/work">Explore my engineering</Link></div></aside>
    </div>
    {notes.length > 0 && <section className="editorial-section" aria-labelledby="accordo-notes"><div className="editorial-section-heading"><h2 id="accordo-notes">Building Accordo</h2><PageCopyText text={copy.accordoNotesIntro} /></div><PublicEntryList entries={notes} emptyMessage="" /></section>}
  </div>;
}
