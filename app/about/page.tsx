import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About",
};

export default function About() {
  return (
    <>
      <h1>About</h1>
      <p>
        I grew up in Miami and I&rsquo;m studying computer science at the
        University of Florida. Right now I&rsquo;m an AI engineering intern at
        Handtevy, where I build document intelligence pipelines for emergency
        medicine software that more than 200,000 clinicians use.
      </p>
      <p>
        That work is why I care about extraction, retrieval, and eval harnesses
        for systems that cannot afford to be wrong. It is also where most of my
        open source time goes, mainly to docling, vLLM, SGLang, and the MCP
        SDKs.
      </p>
      <p>
        I&rsquo;m also a classical pianist. On the side I founded and run
        Accordo, a booking and payments marketplace for musicians.
      </p>
    </>
  );
}
