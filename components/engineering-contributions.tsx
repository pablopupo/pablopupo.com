"use client";

import { useState } from "react";
import type { Contribution, ContributionStatus } from "@/lib/contributions";
import { externalLinkProps } from "@/lib/links";

const filters = [
  { status: "merged", label: "Merged" },
  { status: "open", label: "Open" },
  { status: "closed", label: "Closed" },
] as const;
const pageSize = 6;

export default function EngineeringContributions({ contributions }: { contributions: Contribution[] }) {
  const [status, setStatus] = useState<ContributionStatus>(() =>
    filters.find((filter) => contributions.some((item) => item.status === filter.status))?.status ?? "merged"
  );
  const [expanded, setExpanded] = useState(false);
  const matching = contributions.filter((item) => item.status === status);
  const visible = expanded ? matching : matching.slice(0, pageSize);

  return <div className="engineering-contributions">
    <div className="contribution-filters" role="group" aria-label="Filter contributions by status">
      {filters.map((filter) => <button key={filter.status} type="button" aria-pressed={status === filter.status} aria-controls="engineering-contribution-list" onClick={() => { setStatus(filter.status); setExpanded(false); }}>
        {filter.label}<span>{contributions.filter((item) => item.status === filter.status).length}</span>
      </button>)}
    </div>
    <p className="visually-hidden" role="status">Showing {visible.length} of {matching.length} {status} contributions.</p>
    <ul id="engineering-contribution-list" className="engineering-contribution-list">
      {visible.map((contribution) => <li key={contribution.url}>
        <a href={contribution.url} {...externalLinkProps(contribution.url)}>
          <span className="engineering-contribution-copy">
            <span className="engineering-contribution-title">{contribution.homepageTitle ?? contribution.title.charAt(0).toUpperCase() + contribution.title.slice(1)}</span>
            <span className="engineering-contribution-repo">{contribution.repo.split("/")[1]} #{contribution.pr}</span>
          </span>
          <span className="engineering-contribution-arrow" aria-hidden="true">↗</span>
          <span className="visually-hidden">Opens on GitHub in a new tab</span>
        </a>
      </li>)}
    </ul>
    {matching.length === 0 && <p className="engineering-contributions-empty">No {status} contributions in this collection.</p>}
    {!expanded && matching.length > pageSize && <button className="contributions-show-more" type="button" onClick={() => setExpanded(true)} aria-controls="engineering-contribution-list">Show all {matching.length} {status} contributions <span aria-hidden="true">↓</span></button>}
  </div>;
}
