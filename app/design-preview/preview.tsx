"use client";

import { useState } from "react";
import Link from "next/link";
import KnowledgeGraph from "@/components/knowledge-graph";
import RecordingFeature, { type RecordingLayout } from "@/components/recording-feature";
import type { PublicGraphData } from "@/lib/public-graph";
import type { PublicEntry } from "@/lib/public-content";

const hubOptions = [
  { value: "rings", label: "Open circles", description: "The current look. Larger circles and bold names give the two areas equal weight." },
  { value: "halo", label: "Double rings", description: "A second ring makes the starting points stand out from the smaller topics." },
  { value: "names", label: "Names first", description: "Smaller points with larger serif names. A quieter, more typographic approach." },
] as const;
const recordingOptions = [
  { value: "split", label: "Side by side", description: "A smaller player beside the piece and recital details. This is on the homepage now." },
  { value: "compact", label: "Compact row", description: "A small player with the details alongside it. More room for the rest of the homepage." },
  { value: "centered", label: "Centered", description: "One medium player with a simple caption beneath it." },
] as const;

export default function DesignPreview({ graph, recording, performances }: { graph: PublicGraphData; recording?: PublicEntry; performances: Record<string, { youtubeUrl: string; title: string; label?: string }> }) {
  const [hubStyle, setHubStyle] = useState<"rings" | "halo" | "names">("rings");
  const [recordingLayout, setRecordingLayout] = useState<RecordingLayout>("split");
  return <div className="design-preview">
    <header className="editorial-header"><h1>Try a few directions</h1><p>Switch between options to compare them in place.</p><div className="preview-links"><Link href="/">Back to the homepage</Link><Link href={recording ? `/admin?entry=${recording.slug}` : "/admin"}>Edit the recording in Studio</Link></div></header>
    <section className="design-preview-section" aria-labelledby="hub-preview-title">
      <h2 id="hub-preview-title">Engineering and Music</h2>
      <div className="preview-options" role="group" aria-label="Node appearance">{hubOptions.map((option) => <button key={option.value} type="button" aria-pressed={hubStyle === option.value} onClick={() => setHubStyle(option.value)}>{option.label}</button>)}</div>
      <p className="preview-description">{hubOptions.find((option) => option.value === hubStyle)?.description}</p>
      <div className="home-connections"><KnowledgeGraph data={graph} hubStyle={hubStyle} performances={performances} /></div>
    </section>
    {recording && <section className="design-preview-section" aria-labelledby="recording-preview-title">
      <h2 id="recording-preview-title">The recording section</h2>
      <div className="preview-options" role="group" aria-label="Recording layout">{recordingOptions.map((option) => <button key={option.value} type="button" aria-pressed={recordingLayout === option.value} onClick={() => setRecordingLayout(option.value)}>{option.label}</button>)}</div>
      <p className="preview-description">{recordingOptions.find((option) => option.value === recordingLayout)?.description}</p>
      <div className="section-heading"><h2>Recordings</h2><Link href="/music">All music</Link></div>
      <RecordingFeature entry={recording} layout={recordingLayout} />
    </section>}
  </div>;
}
