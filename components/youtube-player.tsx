"use client";

import { useRef, useState } from "react";
import { usePlayback, YoutubeIframe } from "./playback-provider";

export default function YoutubePlayer({ id, title, transitionName, posterSizes }: { id: string; title: string; transitionName?: string; posterSizes?: string }) {
  const playback = usePlayback();
  const slot = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);

  return <div ref={slot} className="youtube-frame" data-youtube-slot={id} data-video-transition={transitionName} style={{ viewTransitionName: transitionName }}>
    {playing && !playback ? <YoutubeIframe id={id} title={title} /> : <button className="youtube-preview" type="button" aria-label={`Play ${title}`} onClick={(event) => {
      if (playback && slot.current) playback.play({ id, title, origin: slot.current, focus: event.detail === 0 });
      else setPlaying(true);
    }}>
      <YoutubePoster id={id} sizes={posterSizes} />
      <span className="youtube-play" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="m9 5 11 7-11 7Z" /></svg></span>
    </button>}
  </div>;
}

function YoutubePoster({ id, sizes = "(max-width: 520px) 100vw, 24rem" }: { id: string; sizes?: string }) {
  const [fallback, setFallback] = useState(false);
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return <img
    src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}
    srcSet={fallback ? undefined : `https://i.ytimg.com/vi/${id}/hqdefault.jpg 480w, https://i.ytimg.com/vi/${id}/maxresdefault.jpg 1280w`}
    sizes={sizes} alt="" width={480} height={360} loading="lazy" decoding="async"
    onLoad={(event) => {
      // YouTube can return a 120px placeholder with HTTP 200 for missing artwork.
      if (event.currentTarget.naturalWidth < 480 && !fallback) setFallback(true);
    }}
    onError={() => { if (!fallback) setFallback(true); else setFailed(true); }}
  />;
}
