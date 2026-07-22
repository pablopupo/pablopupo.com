import { z } from "zod";
import { entryMutationSchema, type EntryMutation } from "../db/validation";
import {
  EntryConflictError,
  EntryNotFoundError,
  EntryStateError,
} from "./repository";

const createDraftSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(200),
    kind: z.enum(["note", "essay", "performance"]).default("note"),
    summary: z.string().trim().max(500).nullable().optional(),
    bodyMarkdown: z.string().max(250_000).default(""),
    performance: z.unknown().nullable().optional(),
  })
  .strict();

const updateSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    entry: entryMutationSchema,
  })
  .strict();

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish"), expectedVersion: z.number().int().positive() }),
  z.object({
    action: z.literal("schedule"),
    expectedVersion: z.number().int().positive(),
    scheduledAt: z.coerce.date(),
  }),
  z.object({ action: z.literal("unpublish"), expectedVersion: z.number().int().positive() }),
  z.object({ action: z.literal("archive"), expectedVersion: z.number().int().positive() }),
  z.object({ action: z.literal("duplicate") }),
]);

const deleteSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    confirmation: z.string().min(1),
  })
  .strict();
const entryIdSchema = z.uuid();

type AdminAccess =
  | { status: "unconfigured" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "authorized"; userId: string };

type AdminEntryRepository = {
  listEntries: () => Promise<unknown>;
  createDraft: (input: {
    slug: string;
    title: string;
    kind?: "note" | "essay" | "performance";
    summary?: string | null;
    bodyMarkdown?: string;
    performance?: EntryMutation["performance"];
  }, now?: Date) => Promise<unknown>;
  getEntry: (id: string) => Promise<{ slug: string } | undefined>;
  updateEntry: (
    id: string,
    expectedVersion: number,
    entry: EntryMutation,
    now?: Date
  ) => Promise<unknown>;
  transitionEntry: (
    id: string,
    expectedVersion: number,
    transition:
      | { action: "publish" }
      | { action: "schedule"; scheduledAt: Date }
      | { action: "unpublish" }
      | { action: "archive" },
    now?: Date
  ) => Promise<unknown>;
  duplicateEntry: (id: string, now?: Date) => Promise<unknown>;
  deleteEntry: (id: string, expectedVersion: number) => Promise<boolean>;
};

type AdminEntryHandlerDependencies = {
  authorize: (headers: Headers) => Promise<AdminAccess>;
  isSameOrigin: (request: Request) => boolean;
  now: () => Date;
  revalidate: () => void;
  repository: AdminEntryRepository;
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

function entryIdValidationResponse(id: string) {
  const result = entryIdSchema.safeParse(id);
  return result.success ? undefined : validationResponse(result.error);
}

function repositoryErrorResponse(error: unknown) {
  if (error instanceof EntryConflictError) {
    return Response.json({ error: "entry changed in another session" }, { status: 409 });
  }
  if (error instanceof EntryStateError) {
    return Response.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof EntryNotFoundError) {
    return Response.json({ error: "entry not found" }, { status: 404 });
  }
  if (typeof error === "object" && error && "code" in error && error.code === "23505") {
    return Response.json({ error: "slug is already in use" }, { status: 422 });
  }
  return Response.json({ error: "request failed" }, { status: 500 });
}

export function createAdminEntryHandlers(dependencies: AdminEntryHandlerDependencies) {
  async function authorize(request: Request, mutation: boolean) {
    const access = await dependencies.authorize(request.headers);
    const response = accessResponse(access);
    if (response) return response;
    if (mutation && !dependencies.isSameOrigin(request)) {
      return Response.json({ error: "same-origin request required" }, { status: 403 });
    }
    return undefined;
  }

  async function parseJson(request: Request) {
    return request.json().catch(() => undefined);
  }

  return {
    async list(request: Request) {
      const rejection = await authorize(request, false);
      if (rejection) return rejection;
      return Response.json({ entries: await dependencies.repository.listEntries() });
    },

    async create(request: Request) {
      const rejection = await authorize(request, true);
      if (rejection) return rejection;
      const draft = createDraftSchema.safeParse(await parseJson(request));
      if (!draft.success) return validationResponse(draft.error);
      const entry = entryMutationSchema.safeParse({
        ...draft.data,
        status: "draft",
        publishedAt: null,
      });
      if (!entry.success) return validationResponse(entry.error);
      try {
        const created = await dependencies.repository.createDraft(
          entry.data,
          dependencies.now()
        );
        dependencies.revalidate();
        return Response.json({ entry: created }, { status: 201 });
      } catch (error) {
        return repositoryErrorResponse(error);
      }
    },

    async load(request: Request, id: string) {
      const rejection = await authorize(request, false);
      if (rejection) return rejection;
      const invalidId = entryIdValidationResponse(id);
      if (invalidId) return invalidId;
      const entry = await dependencies.repository.getEntry(id);
      if (!entry) return Response.json({ error: "entry not found" }, { status: 404 });
      return Response.json({ entry });
    },

    async update(request: Request, id: string) {
      const rejection = await authorize(request, true);
      if (rejection) return rejection;
      const invalidId = entryIdValidationResponse(id);
      if (invalidId) return invalidId;
      const mutation = updateSchema.safeParse(await parseJson(request));
      if (!mutation.success) return validationResponse(mutation.error);
      try {
        const entry = await dependencies.repository.updateEntry(
          id,
          mutation.data.expectedVersion,
          mutation.data.entry,
          dependencies.now()
        );
        dependencies.revalidate();
        return Response.json({ entry });
      } catch (error) {
        return repositoryErrorResponse(error);
      }
    },

    async action(request: Request, id: string) {
      const rejection = await authorize(request, true);
      if (rejection) return rejection;
      const invalidId = entryIdValidationResponse(id);
      if (invalidId) return invalidId;
      const action = actionSchema.safeParse(await parseJson(request));
      if (!action.success) return validationResponse(action.error);
      try {
        if (action.data.action === "duplicate") {
          const entry = await dependencies.repository.duplicateEntry(
            id,
            dependencies.now()
          );
          dependencies.revalidate();
          return Response.json({ entry }, { status: 201 });
        }
        const transition =
          action.data.action === "schedule"
            ? { action: "schedule" as const, scheduledAt: action.data.scheduledAt }
            : { action: action.data.action };
        const entry = await dependencies.repository.transitionEntry(
          id,
          action.data.expectedVersion,
          transition,
          dependencies.now()
        );
        dependencies.revalidate();
        return Response.json({ entry });
      } catch (error) {
        return repositoryErrorResponse(error);
      }
    },

    async remove(request: Request, id: string) {
      const rejection = await authorize(request, true);
      if (rejection) return rejection;
      const invalidId = entryIdValidationResponse(id);
      if (invalidId) return invalidId;
      const deletion = deleteSchema.safeParse(await parseJson(request));
      if (!deletion.success) return validationResponse(deletion.error);
      const entry = await dependencies.repository.getEntry(id);
      if (!entry) return Response.json({ error: "entry not found" }, { status: 404 });
      if (deletion.data.confirmation !== entry.slug) return validationResponse();
      try {
        await dependencies.repository.deleteEntry(id, deletion.data.expectedVersion);
        dependencies.revalidate();
        return new Response(null, { status: 204 });
      } catch (error) {
        return repositoryErrorResponse(error);
      }
    },
  };
}
