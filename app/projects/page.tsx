import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Projects",
};

export default function Projects() {
  return (
    <>
      <h1>Projects</h1>

      <section className="project">
        <h2>
          <a href="https://github.com/pablopupo/gradus-ad-parnassum">
            Gradus ad Parnassum
          </a>
        </h2>
        <p>
          RAG over musical notation. It parses scores, annotates them the way
          a musician would, and answers theory questions with measure
          references. First corpus is the Chopin Etudes. Early days; the long
          game is notation-native generation grounded in retrieval.
        </p>
        <div className="meta">
          <a href="https://github.com/pablopupo/gradus-ad-parnassum">github</a>
        </div>
      </section>

      <section className="project">
        <h2>
          <a href="https://github.com/pablopupo/kit-ai">kit-ai</a>
        </h2>
        <p>
          Offline-first emergency first-aid PWA, built with a hackathon team.
          My parts were the IndexedDB retrieval layer, the online/offline TTS
          fallback, and a fine-tuned Llama 3 medical model that is not yet
          wired into the app.
        </p>
        <div className="meta">
          <a href="https://github.com/pablopupo/kit-ai">github</a>
          <a href="https://kit-ai-smoky.vercel.app">live</a>
        </div>
      </section>

      <section className="project">
        <h2>
          <a href="https://huggingface.co/Pablo305/llama3-medical-3b-4bit">
            llama3-medical-3b-4bit
          </a>
        </h2>
        <p>
          Llama 3.2 3B fine-tuned for first-aid question answering and
          quantized to 4 bits. There is a demo Space if you want to talk to it.
        </p>
        <div className="meta">
          <a href="https://huggingface.co/Pablo305/llama3-medical-3b-4bit">
            hugging face
          </a>
          <a href="https://huggingface.co/spaces/Pablo305/offline-medical-assistant">
            demo
          </a>
        </div>
      </section>

      <section className="project" id="accordo">
        <h2>Accordo</h2>
        <p>
          A booking and payments marketplace for musicians. I founded it and
          run it. No public repo or link yet.
        </p>
      </section>

      <section className="project">
        <h2>
          <a href="https://github.com/pablopupo/Nova">Nova</a>
        </h2>
        <p>
          Solana Pay invoicing platform. Won Best Use of Solana at SwampHacks.
        </p>
        <div className="meta">
          <a href="https://github.com/pablopupo/Nova">github</a>
        </div>
      </section>

      <section className="project">
        <h2>
          <a href="https://github.com/pablopupo/subjugator.org">
            SubjuGator website
          </a>
        </h2>
        <p>
          Three.js site for UF&rsquo;s RoboSub team, recognized as the top
          RoboSub website. The team placed top 15 at RoboSub 2025.
        </p>
        <div className="meta">
          <a href="https://github.com/pablopupo/subjugator.org">github</a>
        </div>
      </section>

      <section className="oss" id="open-source">
        <h2 className="oss-title">Open source</h2>

        <h3 className="label">Merged</h3>
        <ul className="prs">
          <li>
            <a
              className="id"
              href="https://github.com/docling-project/docling/pull/3702"
            >
              docling&nbsp;#3702
            </a>
            <span className="desc">
              optional-dependency imports broke the core converter in slim
              installs
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

        <h3 className="label">In review</h3>
        <ul className="prs">
          <li>
            <a
              className="id"
              href="https://github.com/vllm-project/vllm/pull/47439"
            >
              vllm&nbsp;#47439
            </a>
            <span className="desc">
              response_format silently suppressing tool calls when tool_choice
              is auto
            </span>
          </li>
          <li>
            <a
              className="id"
              href="https://github.com/sgl-project/sglang/pull/29952"
            >
              sglang&nbsp;#29952
            </a>
            <span className="desc">
              msgpack round-trip for customized_info, removing the pickle wrap
            </span>
          </li>
          <li>
            <a
              className="id"
              href="https://github.com/modelcontextprotocol/typescript-sdk/pull/2418"
            >
              typescript-sdk&nbsp;#2418
            </a>
            <span className="desc">
              double onerror on transport close, ported to v2
            </span>
          </li>
          <li>
            <a
              className="id"
              href="https://github.com/docling-project/docling/pull/3722"
            >
              docling&nbsp;#3722
            </a>{" "}
            <a
              className="id"
              href="https://github.com/docling-project/docling-core/pull/668"
            >
              docling-core&nbsp;#668
            </a>{" "}
            <a
              className="id"
              href="https://github.com/docling-project/docling-mcp/pull/104"
            >
              docling-mcp&nbsp;#104
            </a>
            <span className="desc">new Box Notes backend chain</span>
          </li>
        </ul>
      </section>
    </>
  );
}
