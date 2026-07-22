import { afterEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  importLegacyContent,
  loadLegacyContent,
  parseLegacyPost,
} from "./legacy-import";
import * as schema from "./schema";
import { createMigratedDatabase } from "./test-database";

const clients: PGlite[] = [];

async function setup() {
  const client = await createMigratedDatabase();
  expect(client, "generated SQL migrations").toBeDefined();
  if (!client) throw new Error("Generated SQL migrations are required");
  clients.push(client);
  return { client, database: drizzle(client, { schema }) };
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe("legacy content conversion", () => {
  it("converts MDX frontmatter to portable Markdown without publishing drafts", () => {
    const draft = parseLegacyPost(
      `---
title: Draft post
date: "2026-07-02"
description: Still private
draft: true
---

# Markdown body`,
      "draft-post"
    );
    const publicPost = parseLegacyPost(
      `---
title: Public post
date: "2026-07-01"
---

Portable body`,
      "public-post"
    );

    expect(draft).toMatchObject({
      slug: "draft-post",
      status: "draft",
      title: "Draft post",
      summary: "Still private",
      bodyMarkdown: "\n# Markdown body",
    });
    expect(publicPost).toMatchObject({
      slug: "public-post",
      status: "published",
      title: "Public post",
      bodyMarkdown: "\nPortable body",
    });
    expect(publicPost.publishedAt).toEqual(new Date("2026-07-01T00:00:00.000Z"));
  });

  it("loads every tracked public source and only the public Accordo copy", () => {
    const content = loadLegacyContent(process.cwd());

    expect(content.entries).toHaveLength(2);
    expect(content.entries.every((entry) => entry.status === "draft")).toBe(true);
    expect(content.contributions).toHaveLength(24);
    expect(content.graphNodes).toHaveLength(27);
    expect(content.graphEdges).toHaveLength(32);
    expect(content.projects.map((project) => project.title)).toEqual([
      "Gradus ad Parnassum",
      "kit-ai",
      "llama3-medical-3b-4bit",
      "Accordo",
      "Nova",
      "SubjuGator website",
    ]);

    const accordo = content.projects.find((project) => project.slug === "accordo");
    expect(accordo).toMatchObject({
      bodyMarkdown:
        "A booking and payments marketplace for musicians. I founded it and run it. No public repo or link yet.",
      technologies: [],
      links: [],
    });
  });
});

describe("legacy content import", () => {
  it("upserts converted records without duplicates on repeated runs", async () => {
    const { client, database } = await setup();

    const first = await importLegacyContent(database, process.cwd());
    await client.exec(
      `UPDATE entries SET title = 'Changed locally'
       WHERE slug = 'how-this-site-publishes'`
    );
    const second = await importLegacyContent(database, process.cwd());

    expect(second).toEqual(first);
    expect(first).toEqual({
      entries: 2,
      projects: 6,
      contributions: 24,
      graphNodes: 27,
      graphEdges: 32,
    });

    const counts = await client.query<{
      entries: number;
      projects: number;
      contributions: number;
      graph_nodes: number;
      graph_edges: number;
    }>(
      `SELECT
         (SELECT COUNT(*)::int FROM entries) AS entries,
         (SELECT COUNT(*)::int FROM projects) AS projects,
         (SELECT COUNT(*)::int FROM open_source_contributions) AS contributions,
         (SELECT COUNT(*)::int FROM knowledge_graph_nodes) AS graph_nodes,
         (SELECT COUNT(*)::int FROM knowledge_graph_edges) AS graph_edges`
    );
    expect(counts.rows[0]).toEqual({
      entries: 2,
      projects: 6,
      contributions: 24,
      graph_nodes: 27,
      graph_edges: 32,
    });

    const posts = await client.query<{ slug: string; status: string; title: string }>(
      `SELECT slug, status, title FROM entries ORDER BY slug`
    );
    expect(posts.rows).toEqual([
      {
        slug: "how-this-site-publishes",
        status: "draft",
        title: "How this site publishes",
      },
      {
        slug: "vllm-tool-calls-and-response-schemas",
        status: "draft",
        title: "Composing tool calls and response schemas in vLLM",
      },
    ]);
  });
});
