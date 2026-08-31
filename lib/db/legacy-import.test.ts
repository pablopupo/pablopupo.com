import { afterEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  importLegacyContent,
  loadLegacyContent,
  parseLegacyPost,
} from "./legacy-import";
import * as schema from "./schema";
import {
  createMigratedDatabase,
  PGLITE_TEST_TIMEOUT_MS,
} from "./test-database";

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
}, PGLITE_TEST_TIMEOUT_MS);

describe("legacy content conversion", () => {
  it("converts MDX frontmatter to portable Markdown without publishing drafts", () => {
    const draft = parseLegacyPost(
      `---
title: Draft post
date: "2026-07-02"
description: Still private
draft: true
tags:
  - TypeScript
  - music
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
      section: "music",
      tags: ["TypeScript", "music"],
    });
    expect(publicPost).toMatchObject({
      slug: "public-post",
      status: "published",
      title: "Public post",
      bodyMarkdown: "\nPortable body",
      section: "writing",
      tags: [],
    });
    expect(publicPost.publishedAt).toEqual(new Date("2026-07-01T00:00:00.000Z"));
  });

  it("loads the curated public projects in editorial order", () => {
    const content = loadLegacyContent(process.cwd());

    expect(content.entries).toHaveLength(2);
    expect(content.entries.every((entry) => entry.status === "draft")).toBe(true);
    expect(content.contributions).toHaveLength(24);
    expect(content.graphNodes).toHaveLength(10);
    expect(content.graphEdges).toHaveLength(9);
    expect(
      content.projects.map(({ slug, title, sortOrder, featured }) => ({
        slug,
        title,
        sortOrder,
        featured,
      }))
    ).toEqual([
      {
        slug: "gradus-ad-parnassum",
        title: "Gradus ad Parnassum",
        sortOrder: 0,
        featured: true,
      },
      { slug: "kit-ai", title: "Kit AI", sortOrder: 1, featured: true },
      { slug: "nova", title: "Nova", sortOrder: 2, featured: true },
      { slug: "accordo", title: "Accordo", sortOrder: 3, featured: false },
    ]);

    const kitAi = content.projects.find((project) => project.slug === "kit-ai");
    expect(kitAi?.links.map(({ kind, url }) => ({ kind, url }))).toEqual([
      { kind: "repository", url: "https://github.com/pablopupo/kit-ai" },
      { kind: "live", url: "https://kit-ai-smoky.vercel.app" },
      {
        kind: "other",
        url: "https://huggingface.co/Pablo305/llama3-medical-3b-4bit",
      },
      {
        kind: "demo",
        url: "https://huggingface.co/spaces/Pablo305/offline-medical-assistant",
      },
    ]);

    expect(
      content.graphNodes
        .filter((node) => node.kind === "project")
        .map(({ key, label, pinned }) => ({ key, label, pinned }))
        .sort((left, right) => left.key.localeCompare(right.key))
    ).toEqual([
      { key: "accordo", label: "Accordo", pinned: false },
      {
        key: "gradus-ad-parnassum",
        label: "Gradus ad Parnassum",
        pinned: true,
      },
      { key: "kit-ai", label: "Kit AI", pinned: true },
      { key: "nova", label: "Nova", pinned: true },
    ]);
    expect(
      content.graphNodes
        .filter((node) => node.kind === "concept")
        .map((node) => node.key)
        .sort()
    ).toEqual([
      "emergency-medicine",
      "music",
      "notation",
      "on-device-ai",
      "payments",
      "retrieval",
    ]);
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
      projects: 4,
      contributions: 24,
      graphNodes: 10,
      graphEdges: 9,
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
      projects: 4,
      contributions: 24,
      graph_nodes: 11,
      graph_edges: 9,
    });

    const importedProjects = await client.query<{
      slug: string;
      sort_order: number;
      featured: boolean;
    }>(`SELECT slug, sort_order, featured FROM projects ORDER BY sort_order, slug`);
    expect(importedProjects.rows).toEqual([
      { slug: "gradus-ad-parnassum", sort_order: 0, featured: true },
      { slug: "kit-ai", sort_order: 1, featured: true },
      { slug: "nova", sort_order: 2, featured: true },
      { slug: "accordo", sort_order: 3, featured: false },
    ]);

    const importedGraphProjects = await client.query<{
      key: string;
      label: string;
      pinned: boolean;
    }>(
      `SELECT key, label, pinned
       FROM knowledge_graph_nodes
       WHERE kind = 'project'
       ORDER BY key`
    );
    expect(importedGraphProjects.rows).toEqual([
      { key: "accordo", label: "Accordo", pinned: false },
      {
        key: "gradus-ad-parnassum",
        label: "Gradus ad Parnassum",
        pinned: true,
      },
      { key: "kit-ai", label: "Kit AI", pinned: true },
      { key: "nova", label: "Nova", pinned: true },
    ]);

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
}, PGLITE_TEST_TIMEOUT_MS);
