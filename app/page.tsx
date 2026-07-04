import KnowledgeGraph from "@/components/knowledge-graph";

export default function Home() {
  return (
    <>
      <h1>Pablo Pupo</h1>
      <p className="intro">
        I&rsquo;m a CS student at the University of Florida and I work in
        applied AI. I build document intelligence pipelines at Handtevy for
        emergency medicine software used by 200,000+ clinicians, contribute to
        open source (docling, vLLM, SGLang, MCP SDKs), and I&rsquo;m a
        classical pianist.
      </p>

      <h2 className="label">Selected work</h2>
      <ul className="entries">
        <li>
          <a
            className="name"
            href="https://github.com/pablopupo/gradus-ad-parnassum"
          >
            gradus-ad-parnassum
          </a>
          <span className="desc">RAG over musical notation, in progress</span>
        </li>
        <li>
          <a className="name" href="https://github.com/pablopupo/kit-ai">
            kit-ai
          </a>
          <span className="desc">offline-first emergency first-aid PWA</span>
        </li>
        <li>
          <a
            className="name"
            href="https://huggingface.co/Pablo305/llama3-medical-3b-4bit"
          >
            llama3-medical-3b-4bit
          </a>
          <span className="desc">Llama 3.2 3B fine-tuned for first-aid QA</span>
        </li>
        <li>
          <span className="name">Accordo</span>
          <span className="desc">
            booking and payments marketplace for musicians
          </span>
        </li>
      </ul>

      <h2 className="label">Recent open source</h2>
      <ul className="prs">
        <li>
          <a
            className="id"
            href="https://github.com/docling-project/docling/pull/3702"
          >
            docling&nbsp;#3702
          </a>
          <span className="desc">
            fix for optional-dependency imports that broke the core converter
            in slim installs
          </span>
        </li>
        <li>
          <a
            className="id"
            href="https://github.com/docling-project/docling/pull/3721"
          >
            docling&nbsp;#3721
          </a>
          <span className="desc">
            code language detection for parsed code blocks
          </span>
        </li>
      </ul>

      <h2 className="label">Connections</h2>
      <p className="graph-note">
        The work on this site, drawn as one map. I tagged the solid edges by
        hand; the dashed ones are computed from the text at build time. Hover
        to explore.
      </p>
      <KnowledgeGraph />
    </>
  );
}
