import type { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import * as schema from "../db/schema";
import {
  createMigratedDatabase,
  PGLITE_TEST_TIMEOUT_MS,
} from "../db/test-database";

const now = new Date("2026-07-27T12:00:00.000Z");
const projectId = "00000000-0000-4000-8000-000000000011";
const projectNodeId = "00000000-0000-4000-8000-000000000012";
const entryId = "00000000-0000-4000-8000-000000000021";
const entryNodeId = "00000000-0000-4000-8000-000000000022";

let client: PGlite | undefined;

function database() {
  if (!client) throw new Error("Graph repository test database is unavailable");
  return drizzle(client, { schema });
}

async function repository() {
  const module = await import("./graph-repository").catch(() => undefined);
  expect(module?.createAdminGraphRepository).toBeTypeOf("function");
  return module!.createAdminGraphRepository(database());
}

async function seedSuggestionSources() {
  if (!client) throw new Error("Graph repository test database is unavailable");
  await client.query(
    `INSERT INTO projects
       (id, slug, kind, status, title, body_markdown, published_at, created_at, updated_at)
     VALUES ($1, 'runtime-lab', 'project', 'published', 'Runtime lab', '', $2, $2, $2)`,
    [projectId, now]
  );
  await client.query(
    `INSERT INTO project_technologies (project_id, name, sort_order)
     VALUES ($1, 'PostgreSQL', 0)`,
    [projectId]
  );
  await client.query(
    `INSERT INTO entries
       (id, slug, kind, section, tags, status, title, body_markdown,
        published_at, created_at, updated_at)
     VALUES
       ($1, 'evaluation-notes', 'note', 'writing', ARRAY['Evaluation'],
        'published', 'Evaluation notes', '', $2, $2, $2)`,
    [entryId, now]
  );
  await client.query(
    `INSERT INTO knowledge_graph_nodes
       (id, key, project_id, label, kind, href, origin, state, created_at, updated_at)
     VALUES
       ($1, $2, $3, 'Runtime lab', 'project', '/work#runtime-lab',
        'automatic', 'public', $4, $4)`,
    [projectNodeId, `project:${projectId}`, projectId, now]
  );
  await client.query(
    `INSERT INTO knowledge_graph_nodes
       (id, key, entry_id, label, kind, href, origin, state, created_at, updated_at)
     VALUES
       ($1, $2, $3, 'Evaluation notes', 'writing', '/writing/evaluation-notes',
        'automatic', 'public', $4, $4)`,
    [entryNodeId, `entry:${entryId}`, entryId, now]
  );
}

beforeAll(async () => {
  client = await createMigratedDatabase();
  expect(client, "generated SQL migrations").toBeDefined();
}, PGLITE_TEST_TIMEOUT_MS);

beforeEach(async () => {
  await client?.exec(
    "TRUNCATE TABLE knowledge_graph_edges, knowledge_graph_nodes, projects, entries CASCADE"
  );
}, PGLITE_TEST_TIMEOUT_MS);

afterAll(async () => {
  await client?.close();
}, PGLITE_TEST_TIMEOUT_MS);

describe.sequential("admin graph repository", () => {
  it("lists the editable graph without legacy open-source nodes", async () => {
    if (!client) throw new Error("Graph repository test database is unavailable");
    await client.query(
      `INSERT INTO knowledge_graph_nodes
         (key, label, kind, origin, state, created_at, updated_at)
       VALUES
         ('applied-ai', 'Applied AI', 'concept', 'manual', 'public', $1, $1),
         ('legacy-pr', 'docling #3702', 'oss', 'manual', 'public', $1, $1)`,
      [now]
    );

    const graph = await (await repository()).listGraph();

    expect(graph.nodes).toEqual([
      expect.objectContaining({ key: "applied-ai", kind: "concept" }),
    ]);
    expect(graph.edges).toEqual([]);
  });

  it("creates a public manual concept with a derived stable key", async () => {
    const graph = await repository();

    const created = await graph.createConcept(
      {
        label: "Healthcare AI",
        summary: "Applied systems used in clinical workflows.",
        pinned: false,
      },
      now
    );

    expect(created).toMatchObject({
      key: "healthcare-ai",
      label: "Healthcare AI",
      body: "Applied systems used in clinical workflows.",
      kind: "concept",
      origin: "manual",
      state: "public",
      pinned: false,
      version: 1,
    });
  });

  it("updates a node at the expected version and preserves it after a stale write", async () => {
    const graph = await repository();
    const created = await graph.createConcept(
      { label: "Evaluation", summary: "Initial summary.", pinned: false },
      now
    );
    const updatedAt = new Date("2026-07-27T13:00:00.000Z");

    const updated = await graph.updateNode(
      created.id,
      1,
      {
        labelOverride: "AI evaluation",
        summaryOverride: "Testing model behavior and system quality.",
        state: "public",
        pinned: true,
      },
      updatedAt
    );

    expect(updated).toMatchObject({
      labelOverride: "AI evaluation",
      summaryOverride: "Testing model behavior and system quality.",
      pinned: true,
      version: 2,
      updatedAt,
    });
    await expect(
      graph.updateNode(
        created.id,
        1,
        {
          labelOverride: "Stale label",
          summaryOverride: null,
          state: "hidden",
          pinned: false,
        },
        new Date("2026-07-27T14:00:00.000Z")
      )
    ).rejects.toMatchObject({ name: "GraphConflictError" });
    await expect(graph.listGraph()).resolves.toMatchObject({
      nodes: [
        expect.objectContaining({
          id: created.id,
          labelOverride: "AI evaluation",
          state: "public",
          version: 2,
        }),
      ],
    });
  });

  it("changes only node state while advancing its optimistic version", async () => {
    const graph = await repository();
    const created = await graph.createConcept(
      {
        label: "Healthcare AI",
        summary: "Applied systems used in clinical workflows.",
        pinned: true,
      },
      now
    );
    const hiddenAt = new Date("2026-07-27T13:00:00.000Z");
    const restoredAt = new Date("2026-07-27T14:00:00.000Z");

    const hidden = await graph.setNodeState(created.id, 1, "hidden", hiddenAt);
    const restored = await graph.setNodeState(
      created.id,
      2,
      "public",
      restoredAt
    );

    expect(hidden).toMatchObject({
      id: created.id,
      label: "Healthcare AI",
      body: "Applied systems used in clinical workflows.",
      pinned: true,
      state: "hidden",
      version: 2,
      createdAt: now,
      updatedAt: hiddenAt,
    });
    expect(restored).toMatchObject({
      id: created.id,
      label: "Healthcare AI",
      body: "Applied systems used in clinical workflows.",
      pinned: true,
      state: "public",
      version: 3,
      createdAt: now,
      updatedAt: restoredAt,
    });
  });

  it("distinguishes a missing node from a stale node state transition", async () => {
    const graph = await repository();
    const created = await graph.createConcept(
      { label: "Evaluation", summary: null, pinned: false },
      now
    );

    await graph.setNodeState(created.id, 1, "hidden", now);

    await expect(
      graph.setNodeState(created.id, 1, "public", now)
    ).rejects.toMatchObject({ name: "GraphConflictError" });
    await expect(
      graph.setNodeState(
        "00000000-0000-4000-8000-000000000099",
        1,
        "hidden",
        now
      )
    ).rejects.toMatchObject({ name: "GraphNotFoundError" });
  });

  it("prevents the same connection from being created in reverse", async () => {
    const graph = await repository();
    const appliedAi = await graph.createConcept(
      { label: "Applied AI", summary: null, pinned: true },
      now
    );
    const evaluation = await graph.createConcept(
      { label: "Evaluation", summary: null, pinned: false },
      now
    );

    await graph.connectNodes(appliedAi.id, evaluation.id, "semantic", now);
    await expect(
      graph.connectNodes(evaluation.id, appliedAi.id, "semantic", now)
    ).rejects.toMatchObject({ name: "GraphConflictError" });
    await expect(graph.listGraph()).resolves.toMatchObject({
      edges: [
        expect.objectContaining({
          sourceId: appliedAi.id,
          targetId: evaluation.id,
          kind: "semantic",
        }),
      ],
    });
  });

  it("requires both endpoint nodes to be public before restoring an edge", async () => {
    const graph = await repository();
    const appliedAi = await graph.createConcept(
      { label: "Applied AI", summary: null, pinned: true },
      now
    );
    const evaluation = await graph.createConcept(
      { label: "Evaluation", summary: null, pinned: false },
      now
    );
    const edge = await graph.connectNodes(
      appliedAi.id,
      evaluation.id,
      "semantic",
      now
    );
    const hiddenAt = new Date("2026-07-27T13:00:00.000Z");
    const restoredAt = new Date("2026-07-27T14:00:00.000Z");

    await graph.setEdgeState(edge.id, 1, "hidden", hiddenAt);
    await graph.setNodeState(evaluation.id, 1, "hidden", hiddenAt);

    await expect(
      graph.setEdgeState(edge.id, 2, "public", restoredAt)
    ).rejects.toMatchObject({ name: "GraphConflictError" });
    await expect(graph.listGraph()).resolves.toMatchObject({
      edges: [
        expect.objectContaining({
          id: edge.id,
          state: "hidden",
          version: 2,
          updatedAt: hiddenAt,
        }),
      ],
    });

    await graph.setNodeState(evaluation.id, 2, "public", restoredAt);
    await expect(
      graph.setEdgeState(edge.id, 2, "public", restoredAt)
    ).resolves.toMatchObject({
      id: edge.id,
      state: "public",
      version: 3,
      updatedAt: restoredAt,
    });
  });

  it("distinguishes a missing edge from a stale edge state transition", async () => {
    const graph = await repository();
    const appliedAi = await graph.createConcept(
      { label: "Applied AI", summary: null, pinned: true },
      now
    );
    const evaluation = await graph.createConcept(
      { label: "Evaluation", summary: null, pinned: false },
      now
    );
    const edge = await graph.connectNodes(
      appliedAi.id,
      evaluation.id,
      "semantic",
      now
    );

    await graph.setEdgeState(edge.id, 1, "hidden", now);

    await expect(
      graph.setEdgeState(edge.id, 1, "public", now)
    ).rejects.toMatchObject({ name: "GraphConflictError" });
    await expect(
      graph.setEdgeState(
        "00000000-0000-4000-8000-000000000099",
        1,
        "hidden",
        now
      )
    ).rejects.toMatchObject({ name: "GraphNotFoundError" });
  });

  it("derives pending suggestions from project technologies and entry tags", async () => {
    await seedSuggestionSources();

    const graph = await (await repository()).listGraph();

    expect(graph.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: projectNodeId,
          targetKey: "postgresql",
          targetLabel: "PostgreSQL",
        }),
        expect.objectContaining({
          sourceId: entryNodeId,
          targetKey: "evaluation",
          targetLabel: "Evaluation",
        }),
      ])
    );
  });

  it("persists accepted and ignored suggestions so neither returns as pending", async () => {
    await seedSuggestionSources();
    const graph = await repository();

    await graph.decideSuggestion(
      {
        sourceId: projectNodeId,
        targetKey: "postgresql",
        targetLabel: "PostgreSQL",
        state: "public",
      },
      now
    );
    await graph.decideSuggestion(
      {
        sourceId: entryNodeId,
        targetKey: "evaluation",
        targetLabel: "Evaluation",
        state: "hidden",
      },
      now
    );

    const reloaded = await (await repository()).listGraph();
    expect(reloaded.suggestions).toEqual([]);
    const targetIds = new Map(reloaded.nodes.map((node: { id: string; key: string }) => [
      node.key,
      node.id,
    ]));
    expect(reloaded.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: projectNodeId,
          targetId: targetIds.get("postgresql"),
          origin: "automatic",
          state: "public",
        }),
        expect.objectContaining({
          sourceId: entryNodeId,
          targetId: targetIds.get("evaluation"),
          origin: "automatic",
          state: "hidden",
        }),
      ])
    );
  });
});
