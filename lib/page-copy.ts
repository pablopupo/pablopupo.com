// Plain text shared by Studio and the public pages. Missing values retain the
// current site copy; an explicitly empty optional field stays empty.
export const DEFAULT_PAGE_COPY = {
  homeEngineeringIntro: "I build software and AI systems. Here are my projects, experiments, and notes along the way.",
  homeMusicIntro: "Performances, compositions, and notes on the music I’m playing and listening to.",
  homeAccordoEyebrow: "Where music and engineering meet",
  homeAccordoIntro: "Bringing music into the 21st century by connecting the music community.",
  engineeringIntro: "AI Engineer at Handtevy.",
  musicIntro: "Piano recordings, original compositions, and notes on music.",
  writingIntro: "Notes and essays on software, AI, and music.",
  accordoEyebrow: "A startup I’m building",
  accordoTitle: "A more connected\nmusic community.",
  accordoIntro: "Connecting musicians with one another and with opportunities. Bringing music into the 21st century.",
  accordoStoryTitle: "Why this matters to me",
  accordoStory: "Classical music is a central part of my life. Accordo brings that part of me together with my work as an engineer.\n\nOur ambition is to modernize the music community: help musicians find each other, form connections, and discover opportunities.\n\nI’m building toward that with Accordo. I’ll share the work and what I learn along the way here.",
  accordoAsideEyebrow: "At the intersection",
  accordoAsideTitle: "Music informs\nwhat I build.",
  accordoAsideIntro: "Hear the playing behind the project, or explore my engineering work.",
  accordoNotesIntro: "Notes from the process.",
  aboutSchool: "University of Florida",
  aboutStudy: "Computer science",
};

export type PageCopy = typeof DEFAULT_PAGE_COPY;
export type PageCopyKey = keyof PageCopy;
export type PageCopyPatch = Partial<PageCopy>;
export const PAGE_COPY_KEYS = Object.keys(DEFAULT_PAGE_COPY) as [PageCopyKey, ...PageCopyKey[]];
export const PAGE_COPY_HEADINGS: PageCopyKey[] = ["accordoTitle", "accordoStoryTitle", "accordoAsideTitle"];

export function resolvePageCopy(value?: PageCopyPatch | null, headline?: string): PageCopy {
  const result = { ...DEFAULT_PAGE_COPY };
  if (headline) result.engineeringIntro = `${headline.replace(/[.!?]+$/, "")}.`;
  for (const key of PAGE_COPY_KEYS) {
    if (typeof value?.[key] === "string") result[key] = value[key];
  }
  return result;
}

export function changedPageCopy(saved: PageCopy, edited: PageCopy): PageCopyPatch {
  return Object.fromEntries(PAGE_COPY_KEYS.filter((key) => saved[key] !== edited[key]).map((key) => [key, edited[key]]));
}
