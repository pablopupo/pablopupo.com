import type { PublicEntry } from "@/lib/public-content";
import { formatEditorialDate, YoutubeEmbed } from "./public-entry-list";
import Link from "./page-link";
import { NamedViewTransition } from "./view-transition";

export type RecordingLayout = "split" | "compact" | "centered";

export default function RecordingFeature({ entry, layout = "split", showSummary = false, composerLabel }: { entry: PublicEntry; layout?: RecordingLayout; showSummary?: boolean; composerLabel?: string }) {
  if (!entry.performance) return null;
  const recording = entry.performance;
  return <article className={`recording-feature recording-feature-${layout}`}>
    <div className="recording-feature-video">
      <YoutubeEmbed url={recording.youtubeUrl} title={`${recording.workTitle} by ${recording.composer}`} transitionName={`recording-video-${entry.slug}`} />
    </div>
    <div className="recording-feature-copy">
      <p className="recording-composer">{composerLabel ?? recording.composer}</p>
      <NamedViewTransition name={`entry-music-${entry.slug}`} shareClass="recording-title"><h3><Link href={`/music/${entry.slug}`} transitionTypes={["recording"]}>{recording.workTitle}</Link></h3></NamedViewTransition>
      {showSummary && entry.summary && <p className="recording-summary">{entry.summary}</p>}
      {recording.performedAt && <p className="recording-date"><time dateTime={recording.performedAt}>{formatEditorialDate(recording.performedAt)}</time></p>}
      {recording.venue && <p className="recording-venue">{recording.venue}</p>}
      {recording.notesMarkdown && <Link className="recording-notes-link" href={`/music/${entry.slug}`} transitionTypes={["recording"]}>About this performance <span aria-hidden="true">→</span></Link>}
    </div>
  </article>;
}
