import {
  getContributions,
  type Contribution,
  type ContributionStatus,
} from "./contributions";

export type PrState = { state: "open" | "closed"; merged: boolean };

const REVALIDATE_SECONDS = 21600;

export function reconcile(c: Contribution, pr: PrState | null): Contribution {
  if (!pr) return c;
  const status: ContributionStatus = pr.merged
    ? "merged"
    : pr.state === "closed"
      ? "closed"
      : "open";
  return { ...c, status };
}

async function fetchPrState(c: Contribution): Promise<PrState | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  try {
    const res = await fetch(
      `https://api.github.com/repos/${c.repo}/pulls/${c.pr}`,
      { headers, next: { revalidate: REVALIDATE_SECONDS } }
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { state: string; merged: boolean };
    return {
      state: body.state === "open" ? "open" : "closed",
      merged: body.merged === true,
    };
  } catch {
    return null;
  }
}

export async function getLiveContributions(): Promise<Contribution[]> {
  const stored = getContributions();
  const states = await Promise.all(stored.map(fetchPrState));
  return stored.map((c, i) => reconcile(c, states[i]));
}
