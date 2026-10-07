import type { PublicEntry, PublicPerformance } from "@/lib/public-content";
import { formatEditorialDate, YoutubeEmbed } from "./public-entry-list";
import Link from "./page-link";
import { NamedViewTransition } from "./view-transition";

type Recording = PublicEntry & { performance: PublicPerformance };

export default function MusicLibrary({ recordings, pianist }: { recordings: Recording[]; pianist: string }) {
  if (recordings.length === 0) return null;

  return <section id="recordings" className="music-section music-recordings" aria-labelledby="music-recordings-title">
    <div className="music-section-heading"><h2 id="music-recordings-title">Recordings</h2></div>
    <ol className="music-recording-list">
      {recordings.map((entry) => <li key={entry.slug}>
        <article className="music-recording">
          <YoutubeEmbed url={entry.performance.youtubeUrl} title={`${entry.performance.workTitle} by ${entry.performance.composer}`} transitionName={`recording-video-${entry.slug}`} />
          <p className="recording-composer">{entry.performance.composer === pianist ? "Original composition" : entry.performance.composer}</p>
          <NamedViewTransition name={`entry-music-${entry.slug}`} shareClass="recording-title"><h3><Link href={`/music/${entry.slug}`} transitionTypes={["recording"]}>{entry.performance.workTitle}</Link></h3></NamedViewTransition>
          {entry.performance.performedAt && <p className="recording-date"><time dateTime={entry.performance.performedAt}>{formatEditorialDate(entry.performance.performedAt)}</time></p>}
          {entry.performance.venue && <p className="recording-venue">{entry.performance.venue}</p>}
        </article>
      </li>)}
    </ol>
  </section>;
}
