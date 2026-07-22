import { z } from "zod";
import {
  normalizeDueScheduledPublication,
  projectMutationSchema,
  type ProjectMutation,
} from "../db/validation";
import {
  ProjectConflictError,
  ProjectNotFoundError,
} from "./project-repository";

const createDraftSchema = projectMutationSchema.superRefine((project, context) => {
  if (project.status !== "draft") {
    context.addIssue({
      code: "custom",
      path: ["status"],
      message: "New projects must start as drafts",
    });
  }
  if (project.publishedAt) {
    context.addIssue({
      code: "custom",
      path: ["publishedAt"],
      message: "New drafts cannot have a publication time",
    });
  }
});

const updateSchema = z
  .object({
    expectedUpdatedAt: z.coerce.date(),
    project: projectMutationSchema,
  })
  .strict();

const deleteSchema = z
  .object({
    expectedUpdatedAt: z.coerce.date(),
    confirmation: z.string().min(1),
  })
  .strict();

const projectIdSchema = z.uuid();

type AdminAccess =
  | { status: "unconfigured" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "authorized"; userId: string };

type AdminProjectRepository = {
  listProjects: () => Promise<unknown>;
  createDraft: (
    input: Omit<ProjectMutation, "status" | "publishedAt">,
    now?: Date
  ) => Promise<unknown>;
  getProject: (id: string) => Promise<
    | {
        slug: string;
        status: "draft" | "scheduled" | "published" | "archived";
        publishedAt: Date | string | null;
      }
    | undefined
  >;
  updateProject: (
    id: string,
    expectedUpdatedAt: Date,
    project: ProjectMutation,
    now?: Date
  ) => Promise<unknown>;
  deleteProject: (id: string, expectedUpdatedAt: Date) => Promise<boolean>;
};

type AdminProjectHandlerDependencies = {
  authorize: (headers: Headers) => Promise<AdminAccess>;
  isSameOrigin: (request: Request) => boolean;
  now: () => Date;
  revalidate: () => void;
  repository: AdminProjectRepository;
};

function accessResponse(access: AdminAccess) {
  if (access.status === "unconfigured") {
    return Response.json({ error: "admin is not configured" }, { status: 503 });
  }
  if (access.status === "unauthenticated") {
    return Response.json({ error: "authentication required" }, { status: 401 });
  }
  if (access.status === "forbidden") {
    return Response.json({ error: "owner access required" }, { status: 403 });
  }
  return undefined;
}

function validationResponse(error?: z.ZodError) {
  return Response.json(
    {
      error: "validation failed",
      ...(error ? { issues: error.flatten() } : {}),
    },
    { status: 422 }
  );
}

function isUniqueViolation(error: unknown) {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== "object") return false;
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

function repositoryErrorResponse(error: unknown) {
  if (error instanceof ProjectConflictError) {
    return Response.json(
      { error: "project changed in another session" },
      { status: 409 }
    );
  }
  if (error instanceof ProjectNotFoundError) {
    return Response.json({ error: "project not found" }, { status: 404 });
  }
  if (isUniqueViolation(error)) {
    return Response.json(
      { error: "project slug and link URLs must be unique" },
      { status: 422 }
    );
  }
  return Response.json({ error: "request failed" }, { status: 500 });
}

export function createAdminProjectHandlers(
  dependencies: AdminProjectHandlerDependencies
) {
  async function authorize(request: Request, mutation: boolean) {
    const access = await dependencies.authorize(request.headers);
    const response = accessResponse(access);
    if (response) return response;
    if (mutation && !dependencies.isSameOrigin(request)) {
      return Response.json(
        { error: "same-origin request required" },
        { status: 403 }
      );
    }
    return undefined;
  }

  async function parseJson(request: Request) {
    return request.json().catch(() => undefined);
  }

  function invalidProjectId(id: string) {
    const result = projectIdSchema.safeParse(id);
    return result.success ? undefined : validationResponse(result.error);
  }

  return {
    async list(request: Request) {
      const rejection = await authorize(request, false);
      if (rejection) return rejection;
      return Response.json({ projects: await dependencies.repository.listProjects() });
    },

    async create(request: Request) {
      const rejection = await authorize(request, true);
      if (rejection) return rejection;
      const project = createDraftSchema.safeParse(await parseJson(request));
      if (!project.success) return validationResponse(project.error);
      const { status: _status, publishedAt: _publishedAt, ...draft } = project.data;
      try {
        const created = await dependencies.repository.createDraft(
          draft,
          dependencies.now()
        );
        dependencies.revalidate();
        return Response.json({ project: created }, { status: 201 });
      } catch (error) {
        return repositoryErrorResponse(error);
      }
    },

    async load(request: Request, id: string) {
      const rejection = await authorize(request, false);
      if (rejection) return rejection;
      const invalidId = invalidProjectId(id);
      if (invalidId) return invalidId;
      const project = await dependencies.repository.getProject(id);
      if (!project) {
        return Response.json({ error: "project not found" }, { status: 404 });
      }
      return Response.json({ project });
    },

    async update(request: Request, id: string) {
      const rejection = await authorize(request, true);
      if (rejection) return rejection;
      const invalidId = invalidProjectId(id);
      if (invalidId) return invalidId;
      const now = dependencies.now();
      const input = await parseJson(request);
      const current = await dependencies.repository.getProject(id);
      if (!current) {
        return Response.json({ error: "project not found" }, { status: 404 });
      }
      const currentWasDue =
        normalizeDueScheduledPublication(current, now) !== current;
      const normalizedInput =
        input && typeof input === "object" && !Array.isArray(input)
          ? {
              ...input,
              project: currentWasDue
                ? normalizeDueScheduledPublication(
                    (input as { project?: unknown }).project,
                    now
                  )
                : (input as { project?: unknown }).project,
            }
          : input;
      const mutation = updateSchema.safeParse(normalizedInput);
      if (!mutation.success) return validationResponse(mutation.error);
      try {
        const project = await dependencies.repository.updateProject(
          id,
          mutation.data.expectedUpdatedAt,
          mutation.data.project,
          now
        );
        dependencies.revalidate();
        return Response.json({ project });
      } catch (error) {
        return repositoryErrorResponse(error);
      }
    },

    async remove(request: Request, id: string) {
      const rejection = await authorize(request, true);
      if (rejection) return rejection;
      const invalidId = invalidProjectId(id);
      if (invalidId) return invalidId;
      const deletion = deleteSchema.safeParse(await parseJson(request));
      if (!deletion.success) return validationResponse(deletion.error);
      const project = await dependencies.repository.getProject(id);
      if (!project) {
        return Response.json({ error: "project not found" }, { status: 404 });
      }
      if (deletion.data.confirmation !== project.slug) {
        return validationResponse();
      }
      try {
        await dependencies.repository.deleteProject(
          id,
          deletion.data.expectedUpdatedAt
        );
        dependencies.revalidate();
        return new Response(null, { status: 204 });
      } catch (error) {
        return repositoryErrorResponse(error);
      }
    },
  };
}
