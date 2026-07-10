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

    </>
  );
}
