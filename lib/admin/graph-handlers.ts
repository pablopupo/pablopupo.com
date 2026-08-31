import { z } from "zod";
import {
  graphConceptMutationSchema,
  graphMutationSchema,
  type GraphConceptMutation,
  type GraphNodeMutation,
  type GraphSuggestionDecision,
} from "./graph-validation";
import {
  GraphConflictError,
  GraphNotFoundError,
} from "./graph-repository";

type AdminAccess =
  | { status: "unconfigured" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "authorized"; userId: string };

type AdminGraphRepository = {
  listGraph: () => Promise<unknown>;
  createConcept: (input: GraphConceptMutation, now?: Date) => Promise<unknown>;
  updateNode: (
    id: string,
    expectedVersion: number,
    input: GraphNodeMutation,
    now?: Date
  ) => Promise<unknown>;
  setNodeState: (
    id: string,
    expectedVersion: number,
    state: "public" | "hidden",
    now?: Date
  ) => Promise<unknown>;
  connectNodes: (
    sourceId: string,
    targetId: string,
    kind: "tag" | "link" | "semantic",
    now?: Date
  ) => Promise<unknown>;
  setEdgeState: (
    id: string,
    expectedVersion: number,
    state: "public" | "hidden",
    now?: Date
  ) => Promise<unknown>;
  decideSuggestion: (
    input: GraphSuggestionDecision,
    now?: Date
  ) => Promise<unknown>;
};

type AdminGraphHandlerDependencies = {
  authorize: (headers: Headers) => Promise<AdminAccess>;
  isSameOrigin: (request: Request) => boolean;
  now: () => Date;
  revalidate: () => void;
  repository: AdminGraphRepository;
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
  if (error instanceof GraphConflictError) {
    return Response.json(
      { error: "graph changed in another session" },
      { status: 409 }
    );
  }
  if (error instanceof GraphNotFoundError) {
    return Response.json({ error: "graph item not found" }, { status: 404 });
  }
  if (isUniqueViolation(error)) {
    return Response.json(
      { error: "a concept with this label already exists" },
      { status: 422 }
    );
  }
  return Response.json({ error: "request failed" }, { status: 500 });
}

export function createAdminGraphHandlers(
  dependencies: AdminGraphHandlerDependencies
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

  return {
    async list(request: Request) {
      const rejection = await authorize(request, false);
      if (rejection) return rejection;
      return Response.json({ graph: await dependencies.repository.listGraph() });
    },

    async createConcept(request: Request) {
      const rejection = await authorize(request, true);
      if (rejection) return rejection;
      const concept = graphConceptMutationSchema.safeParse(
        await parseJson(request)
      );
      if (!concept.success) return validationResponse(concept.error);
      try {
        const node = await dependencies.repository.createConcept(
          concept.data,
          dependencies.now()
        );
        dependencies.revalidate();
        return Response.json({ node }, { status: 201 });
      } catch (error) {
        return repositoryErrorResponse(error);
      }
    },

    async mutate(request: Request) {
      const rejection = await authorize(request, true);
      if (rejection) return rejection;
      const mutation = graphMutationSchema.safeParse(await parseJson(request));
      if (!mutation.success) return validationResponse(mutation.error);
      const now = dependencies.now();
      try {
        if (mutation.data.action === "updateNode") {
          const node = await dependencies.repository.updateNode(
            mutation.data.id,
            mutation.data.expectedVersion,
            mutation.data.node,
            now
          );
          dependencies.revalidate();
          return Response.json({ node });
        }
        if (mutation.data.action === "setNodeState") {
          const node = await dependencies.repository.setNodeState(
            mutation.data.id,
            mutation.data.expectedVersion,
            mutation.data.state,
            now
          );
          dependencies.revalidate();
          return Response.json({ node });
        }
        if (mutation.data.action === "connectNodes") {
          const edge = await dependencies.repository.connectNodes(
            mutation.data.sourceId,
            mutation.data.targetId,
            mutation.data.kind,
            now
          );
          dependencies.revalidate();
          return Response.json({ edge }, { status: 201 });
        }
        if (mutation.data.action === "setEdgeState") {
          const edge = await dependencies.repository.setEdgeState(
            mutation.data.id,
            mutation.data.expectedVersion,
            mutation.data.state,
            now
          );
          dependencies.revalidate();
          return Response.json({ edge });
        }
        const decision = await dependencies.repository.decideSuggestion(
          mutation.data.suggestion,
          now
        );
        dependencies.revalidate();
        return Response.json({ decision });
      } catch (error) {
        return repositoryErrorResponse(error);
      }
    },
  };
}
