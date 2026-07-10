import type { Metadata } from "next";
import { getContributions, groupByStatus, shortRef } from "@/lib/contributions";

export const metadata: Metadata = {
  title: "Contributions",
};

const SECTIONS = [
  ["merged", "Merged"],
  ["open", "In review"],
  ["closed", "Closed"],
] as const;

export default function Contributions() {
  const groups = groupByStatus(getContributions());

  return (
    <>
      <h1>Open source contributions</h1>
      <p>
        Everything I have shipped or have in flight across the LLM serving and
        document intelligence stack, as GitHub user{" "}
        <a href="https://github.com/pablopupo">pablopupo</a>.
      </p>
      {SECTIONS.map(([key, label]) =>
        groups[key].length > 0 ? (
          <section key={key}>
            <h2 className="label">{label}</h2>
            <ul className="prs">
              {groups[key].map((c) => (
                <li key={c.url}>
                  <a className="id" href={c.url}>
                    {shortRef(c)}
                  </a>
                  <span className="desc">{c.title}</span>
                  {c.writeup && (
                    <a className="writeup" href={`/writing/${c.writeup}`}>
                      writeup
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : null
      )}
    </>
  );
}
