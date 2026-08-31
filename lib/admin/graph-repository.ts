import { and, asc, desc, eq, ne, or } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  entries,
  knowledgeGraphEdges,
  knowledgeGraphNodes,
  projectTechnologies,
} from "../db/schema";
import type * as schema from "../db/schema";
import type {
  GraphConceptMutation,
  GraphNodeMutation,
  GraphSuggestionDecision,
} from "./graph-validation";

export class GraphConflictError extends Error {
  name = "GraphConflictError";
}

export class GraphNotFoundError extends Error {
  name = "GraphNotFoundError";
}

function graphKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function pairKey(sourceId: string, targetId: string) {
  return [sourceId, targetId].sort().join(":");
}

export function createAdminGraphRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: PgDatabase<TQueryResult, typeof schema>) {
  return {
    async listGraph() {
      const nodes = await database
        .select()
        .from(knowledgeGraphNodes)
        .where(ne(knowledgeGraphNodes.kind, "oss"))
        .orderBy(
          desc(knowledgeGraphNodes.pinned),
          asc(knowledgeGraphNodes.label),
          asc(knowledgeGraphNodes.key)
        );
      const publicNodeIds = new Set(nodes.map((node) => node.id));
      const allEdges = await database
        .select()
        .from(knowledgeGraphEdges)
        .orderBy(
          asc(knowledgeGraphEdges.createdAt),
          asc(knowledgeGraphEdges.id)
        );
      const edges = allEdges.filter(
        (edge) =>
          publicNodeIds.has(edge.sourceId) && publicNodeIds.has(edge.targetId)
      );
      const concepts = new Map(
        nodes
          .filter((node) => node.kind === "concept")
          .map((node) => [node.key, node])
      );
      const decidedPairs = new Set(
        edges.map((edge) => pairKey(edge.sourceId, edge.targetId))
      );
      const technologyRows = await database
        .select({
          sourceId: knowledgeGraphNodes.id,
          label: projectTechnologies.name,
        })
        .from(knowledgeGraphNodes)
        .innerJoin(
          projectTechnologies,
          eq(knowledgeGraphNodes.projectId, projectTechnologies.projectId)
        )
        .where(ne(knowledgeGraphNodes.kind, "oss"))
        .orderBy(
          asc(knowledgeGraphNodes.id),
          asc(projectTechnologies.sortOrder),
          asc(projectTechnologies.name)
        );
      const entryRows = await database
        .select({
          sourceId: knowledgeGraphNodes.id,
          labels: entries.tags,
        })
        .from(knowledgeGraphNodes)
        .innerJoin(entries, eq(knowledgeGraphNodes.entryId, entries.id))
        .where(ne(knowledgeGraphNodes.kind, "oss"))
        .orderBy(asc(knowledgeGraphNodes.id));
      const candidates = [
        ...technologyRows,
        ...entryRows.flatMap((row) =>
          row.labels.map((label) => ({ sourceId: row.sourceId, label }))
        ),
      ];
      const suggestionKeys = new Set<string>();
      const suggestions = candidates.flatMap((candidate) => {
        const targetKey = graphKey(candidate.label);
        const target = concepts.get(targetKey);
        const key = `${candidate.sourceId}:${targetKey}`;
        if (
          !targetKey ||
          suggestionKeys.has(key) ||
          (target && decidedPairs.has(pairKey(candidate.sourceId, target.id)))
        ) {
          return [];
        }
        suggestionKeys.add(key);
        return [
          {
            id: key,
            sourceId: candidate.sourceId,
            targetId: target?.id ?? null,
            targetKey,
            targetLabel: candidate.label.trim(),
            evidence: candidate.label.trim(),
          },
        ];
      });

      return {
        nodes: nodes.map((node) => ({
          ...node,
          displayLabel: node.labelOverride ?? node.label,
          displaySummary: node.summaryOverride ?? node.body,
        })),
        edges,
        suggestions,
      };
    },

    async createConcept(input: GraphConceptMutation, now = new Date()) {
      const key = graphKey(input.label);
      if (!key) throw new GraphConflictError("Concept needs a stable key");
      const inserted = await database
        .insert(knowledgeGraphNodes)
        .values({
          key,
          label: input.label,
          kind: "concept",
          body: input.summary ?? "",
          origin: "manual",
          state: "public",
          pinned: input.pinned,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return inserted[0]!;
    },

    async updateNode(
      id: string,
      expectedVersion: number,
      input: GraphNodeMutation,
      now = new Date()
    ) {
      const updated = await database
        .update(knowledgeGraphNodes)
        .set({
          labelOverride: input.labelOverride,
          summaryOverride: input.summaryOverride,
          state: input.state,
          pinned: input.pinned,
          version: expectedVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(knowledgeGraphNodes.id, id),
            eq(knowledgeGraphNodes.version, expectedVersion)
          )
        )
        .returning();
      if (updated[0]) return updated[0];
      const current = await database
        .select({ id: knowledgeGraphNodes.id })
        .from(knowledgeGraphNodes)
        .where(eq(knowledgeGraphNodes.id, id))
        .limit(1);
      if (!current[0]) throw new GraphNotFoundError("Graph node not found");
      throw new GraphConflictError("Graph node changed in another session");
    },

    async setNodeState(
      id: string,
      expectedVersion: number,
      state: "public" | "hidden",
      now = new Date()
    ) {
      const updated = await database
        .update(knowledgeGraphNodes)
        .set({
          state,
          version: expectedVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(knowledgeGraphNodes.id, id),
            eq(knowledgeGraphNodes.version, expectedVersion)
          )
        )
        .returning();
      if (updated[0]) return updated[0];
      const current = await database
        .select({ id: knowledgeGraphNodes.id })
        .from(knowledgeGraphNodes)
        .where(eq(knowledgeGraphNodes.id, id))
        .limit(1);
      if (!current[0]) throw new GraphNotFoundError("Graph node not found");
      throw new GraphConflictError("Graph node changed in another session");
    },

    async connectNodes(
      sourceId: string,
      targetId: string,
      kind: "tag" | "link" | "semantic",
      now = new Date()
    ) {
      if (sourceId === targetId) {
        throw new GraphConflictError("A node cannot connect to itself");
      }
      const nodes = await database
        .select({ id: knowledgeGraphNodes.id })
        .from(knowledgeGraphNodes)
        .where(
          or(
            eq(knowledgeGraphNodes.id, sourceId),
            eq(knowledgeGraphNodes.id, targetId)
          )
        );
      if (nodes.length !== 2) {
        throw new GraphNotFoundError("Graph node not found");
      }
      const existing = await database
        .select({ id: knowledgeGraphEdges.id })
        .from(knowledgeGraphEdges)
        .where(
          or(
            and(
              eq(knowledgeGraphEdges.sourceId, sourceId),
              eq(knowledgeGraphEdges.targetId, targetId)
            ),
            and(
              eq(knowledgeGraphEdges.sourceId, targetId),
              eq(knowledgeGraphEdges.targetId, sourceId)
            )
          )
        )
        .limit(1);
      if (existing[0]) {
        throw new GraphConflictError("These nodes are already connected");
      }
      const inserted = await database
        .insert(knowledgeGraphEdges)
        .values({
          sourceId,
          targetId,
          kind,
          origin: "manual",
          state: "public",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return inserted[0]!;
    },

    async setEdgeState(
      id: string,
      expectedVersion: number,
      state: "public" | "hidden",
      now = new Date()
    ) {
      if (state === "public") {
        const currentEdge = await database
          .select({
            sourceId: knowledgeGraphEdges.sourceId,
            targetId: knowledgeGraphEdges.targetId,
          })
          .from(knowledgeGraphEdges)
          .where(
            and(
              eq(knowledgeGraphEdges.id, id),
              eq(knowledgeGraphEdges.version, expectedVersion)
            )
          )
          .limit(1);
        if (currentEdge[0]) {
          const publicEndpoints = await database
            .select({ id: knowledgeGraphNodes.id })
            .from(knowledgeGraphNodes)
            .where(
              and(
                or(
                  eq(knowledgeGraphNodes.id, currentEdge[0].sourceId),
                  eq(knowledgeGraphNodes.id, currentEdge[0].targetId)
                ),
                eq(knowledgeGraphNodes.state, "public")
              )
            );
          if (publicEndpoints.length !== 2) {
            throw new GraphConflictError(
              "Both graph nodes must be public before restoring an edge"
            );
          }
        }
      }
      const updated = await database
        .update(knowledgeGraphEdges)
        .set({
          state,
          version: expectedVersion + 1,
          updatedAt: now,
        })
        .where(
          and(
            eq(knowledgeGraphEdges.id, id),
            eq(knowledgeGraphEdges.version, expectedVersion)
          )
        )
        .returning();
      if (updated[0]) return updated[0];
      const current = await database
        .select({ id: knowledgeGraphEdges.id })
        .from(knowledgeGraphEdges)
        .where(eq(knowledgeGraphEdges.id, id))
        .limit(1);
      if (!current[0]) throw new GraphNotFoundError("Graph edge not found");
      throw new GraphConflictError("Graph edge changed in another session");
    },

    async decideSuggestion(
      input: GraphSuggestionDecision,
      now = new Date()
    ) {
      return database.transaction(async (transaction) => {
        const source = await transaction
          .select({ id: knowledgeGraphNodes.id })
          .from(knowledgeGraphNodes)
          .where(eq(knowledgeGraphNodes.id, input.sourceId))
          .limit(1);
        if (!source[0]) throw new GraphNotFoundError("Graph node not found");

        let target = (
          await transaction
            .select()
            .from(knowledgeGraphNodes)
            .where(eq(knowledgeGraphNodes.key, input.targetKey))
            .limit(1)
        )[0];
        if (!target) {
          target = (
            await transaction
              .insert(knowledgeGraphNodes)
              .values({
                key: input.targetKey,
                label: input.targetLabel,
                kind: "concept",
                origin: "automatic",
                state: input.state === "public" ? "public" : "suggested",
                createdAt: now,
                updatedAt: now,
              })
              .returning()
          )[0]!;
        } else if (input.state === "public" && target.state === "suggested") {
          target = (
            await transaction
              .update(knowledgeGraphNodes)
              .set({
                state: "public",
                version: target.version + 1,
                updatedAt: now,
              })
              .where(eq(knowledgeGraphNodes.id, target.id))
              .returning()
          )[0]!;
        }

        const existing = (
          await transaction
            .select()
            .from(knowledgeGraphEdges)
            .where(
              or(
                and(
                  eq(knowledgeGraphEdges.sourceId, input.sourceId),
                  eq(knowledgeGraphEdges.targetId, target.id)
                ),
                and(
                  eq(knowledgeGraphEdges.sourceId, target.id),
                  eq(knowledgeGraphEdges.targetId, input.sourceId)
                )
              )
            )
            .limit(1)
        )[0];
        const edge = existing
          ? (
              await transaction
                .update(knowledgeGraphEdges)
                .set({
                  state: input.state,
                  version: existing.version + 1,
                  updatedAt: now,
                })
                .where(eq(knowledgeGraphEdges.id, existing.id))
                .returning()
            )[0]!
          : (
              await transaction
                .insert(knowledgeGraphEdges)
                .values({
                  sourceId: input.sourceId,
                  targetId: target.id,
                  kind: "tag",
                  terms: [input.targetLabel],
                  origin: "automatic",
                  state: input.state,
                  createdAt: now,
                  updatedAt: now,
                })
                .returning()
            )[0]!;
        return { node: target, edge };
      });
    },
  };
}
