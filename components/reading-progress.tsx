"use client";

import { useEffect, useState } from "react";

export function readingProgressRatio(
  contentTop: number,
  viewportHeight: number,
  contentHeight: number
) {
  const distance = Math.max(contentHeight - viewportHeight, 1);
  return Math.min(1, Math.max(0, -contentTop / distance));
}

export default function ReadingProgress({ targetId }: { targetId: string }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let frame: number | null = null;

    function update() {
      frame = null;
      const target = document.getElementById(targetId);
      if (!target) return;
      const bounds = target.getBoundingClientRect();
      setProgress(
        readingProgressRatio(bounds.top, window.innerHeight, bounds.height)
      );
    }

    function schedule() {
      if (frame === null) frame = window.requestAnimationFrame(update);
    }

    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [targetId]);

  return (
    <div
      className="reading-progress"
      data-reading-target={targetId}
      aria-hidden="true"
    >
      <span
        className="reading-progress-bar"
        style={{ transform: `scaleX(${progress})` }}
      />
    </div>
  );
}
