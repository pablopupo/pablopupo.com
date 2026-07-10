import fs from "fs";
import path from "path";

export type ContributionStatus = "merged" | "open" | "closed";

export type Contribution = {
  repo: string;
  pr: number;
  url: string;
  title: string;
  date: string;
  status: ContributionStatus;
  writeup?: string;
};

const dataFile = path.join(process.cwd(), "data", "contributions.json");

export function getContributions(): Contribution[] {
  const raw = fs.readFileSync(dataFile, "utf8");
  const list = JSON.parse(raw) as Contribution[];
  return list.sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function groupByStatus(
  list: Contribution[]
): Record<ContributionStatus, Contribution[]> {
  const groups: Record<ContributionStatus, Contribution[]> = {
    merged: [],
    open: [],
    closed: [],
  };
  for (const c of list) groups[c.status].push(c);
  return groups;
}

export function shortRef(c: Contribution): string {
  return `${c.repo.split("/")[1]} #${c.pr}`;
}
