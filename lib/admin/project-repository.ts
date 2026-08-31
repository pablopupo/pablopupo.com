import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  knowledgeGraphNodes,
  projectLinks,
  projects,
  projectTechnologies,
} from "../db/schema";
import { projectGraphSnapshot } from "../db/graph-sync";
import type * as schema from "../db/schema";
import type { ProjectMutation } from "../db/validation";

type ProjectDraftInput = Omit<ProjectMutation, "status" | "publishedAt">;

export class ProjectConflictError extends Error {
  name = "ProjectConflictError";
}

export class ProjectNotFoundError extends Error {
  name = "ProjectNotFoundError";
}

function orderedLinks(links: ProjectMutation["links"]) {
  return [...links].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder || left.label.localeCompare(right.label)
  );
}

function updatedAtMatches(expectedUpdatedAt: Date) {
  return sql`date_trunc('milliseconds', ${projects.updatedAt}) = ${expectedUpdatedAt}`;
}

export function createAdminProjectRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: PgDatabase<TQueryResult, typeof schema>) {
  return {
    async listProjects() {
      return database
        .select({
          id: projects.id,
          slug: projects.slug,
          kind: projects.kind,
          status: projects.status,
          title: projects.title,
          organization: projects.organization,
          publishedAt: projects.publishedAt,
          sortOrder: projects.sortOrder,
          featured: projects.featured,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .orderBy(desc(projects.updatedAt), asc(projects.slug));
    },

    async getProject(id: string) {
      const projectRows = await database
        .select()
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1);
      const project = projectRows[0];
      if (!project) return undefined;
      const technologies = await database
        .select({ name: projectTechnologies.name })
        .from(projectTechnologies)
        .where(eq(projectTechnologies.projectId, id))
        .orderBy(asc(projectTechnologies.sortOrder), asc(projectTechnologies.name));
      const links = await database
        .select({
          kind: projectLinks.kind,
          label: projectLinks.label,
          url: projectLinks.url,
          sortOrder: projectLinks.sortOrder,
        })
        .from(projectLinks)
        .where(eq(projectLinks.projectId, id))
        .orderBy(asc(projectLinks.sortOrder), asc(projectLinks.label));
      return {
        ...project,
        technologies: technologies.map((technology) => technology.name),
        links,
      };
    },

    async createDraft(input: ProjectDraftInput, now = new Date()) {
      return database.transaction(async (transaction) => {
        const id = randomUUID();
        const inserted = await transaction
          .insert(projects)
          .values({
            id,
            slug: input.slug,
            kind: input.kind,
            status: "draft",
            title: input.title,
            organization: input.organization ?? null,
            summary: input.summary ?? null,
            bodyMarkdown: input.bodyMarkdown,
            coverMediaId: input.coverMediaId ?? null,
            startedOn: input.startedOn ?? null,
            endedOn: input.endedOn ?? null,
            publishedAt: null,
            sortOrder: input.sortOrder,
            featured: input.featured ?? false,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        const graphNode = projectGraphSnapshot(inserted[0]!);
        await transaction
          .insert(knowledgeGraphNodes)
          .values({ ...graphNode, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({
            target: knowledgeGraphNodes.projectId,
            set: {
              label: graphNode.label,
              kind: graphNode.kind,
              href: graphNode.href,
              body: graphNode.body,
              origin: graphNode.origin,
              updatedAt: now,
            },
          });
        if (input.technologies.length > 0) {
          await transaction.insert(projectTechnologies).values(
            input.technologies.map((name, sortOrder) => ({
              projectId: id,
              name,
              sortOrder,
            }))
          );
        }
        if (input.links.length > 0) {
          await transaction.insert(projectLinks).values(
            input.links.map((link) => ({ projectId: id, ...link }))
          );
        }
        return {
          ...inserted[0]!,
          technologies: [...input.technologies],
          links: orderedLinks(input.links),
        };
      });
    },

    async updateProject(
      id: string,
      expectedUpdatedAt: Date,
      input: ProjectMutation,
      now = new Date()
    ) {
      return database.transaction(async (transaction) => {
        const currentRows = await transaction
          .select()
          .from(projects)
          .where(eq(projects.id, id))
          .limit(1);
        const current = currentRows[0];
        if (!current) throw new ProjectNotFoundError("Project not found");
        if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
          throw new ProjectConflictError("Project changed in another session");
        }
        const nextUpdatedAt =
          now.getTime() > current.updatedAt.getTime()
            ? now
            : new Date(current.updatedAt.getTime() + 1);
        const updated = await transaction
          .update(projects)
          .set({
            slug: input.slug,
            kind: input.kind,
            status: input.status,
            title: input.title,
            organization: input.organization ?? null,
            summary: input.summary ?? null,
            bodyMarkdown: input.bodyMarkdown,
            coverMediaId:
              input.coverMediaId === undefined
                ? current.coverMediaId
                : input.coverMediaId,
            startedOn: input.startedOn ?? null,
            endedOn: input.endedOn ?? null,
            publishedAt: input.publishedAt ?? null,
            sortOrder: input.sortOrder,
            featured: input.featured ?? current.featured,
            updatedAt: nextUpdatedAt,
          })
          .where(
            and(
              eq(projects.id, id),
              updatedAtMatches(expectedUpdatedAt)
            )
          )
          .returning();
        if (!updated[0]) {
          throw new ProjectConflictError("Project changed in another session");
        }
        const graphNode = projectGraphSnapshot(updated[0]);
        await transaction
          .insert(knowledgeGraphNodes)
          .values({ ...graphNode, createdAt: now, updatedAt: now })
          .onConflictDoUpdate({
            target: knowledgeGraphNodes.projectId,
            set: {
              label: graphNode.label,
              kind: graphNode.kind,
              href: graphNode.href,
              body: graphNode.body,
              origin: graphNode.origin,
              updatedAt: now,
            },
          });
        await transaction
          .delete(projectTechnologies)
          .where(eq(projectTechnologies.projectId, id));
        await transaction.delete(projectLinks).where(eq(projectLinks.projectId, id));
        if (input.technologies.length > 0) {
          await transaction.insert(projectTechnologies).values(
            input.technologies.map((name, sortOrder) => ({
              projectId: id,
              name,
              sortOrder,
            }))
          );
        }
        if (input.links.length > 0) {
          await transaction.insert(projectLinks).values(
            input.links.map((link) => ({ projectId: id, ...link }))
          );
        }
        return {
          ...updated[0],
          technologies: [...input.technologies],
          links: orderedLinks(input.links),
        };
      });
    },

    async deleteProject(id: string, expectedUpdatedAt: Date) {
      return database.transaction(async (transaction) => {
        const deleted = await transaction
          .delete(projects)
          .where(
            and(
              eq(projects.id, id),
              updatedAtMatches(expectedUpdatedAt)
            )
          )
          .returning({ id: projects.id });
        if (deleted[0]) return true;
        const current = await transaction
          .select({ id: projects.id })
          .from(projects)
          .where(eq(projects.id, id))
          .limit(1);
        if (!current[0]) throw new ProjectNotFoundError("Project not found");
        throw new ProjectConflictError("Project changed in another session");
      });
    },
  };
}
