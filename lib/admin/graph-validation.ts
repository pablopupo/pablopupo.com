import { z } from "zod";

const graphLabelSchema = z.string().trim().min(1).max(200);
const graphSummarySchema = z.string().trim().max(500).nullable();
const graphPublicStateSchema = z.enum(["public", "hidden"]);
const graphNodeIdSchema = z.uuid();
const graphKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

export const graphConceptMutationSchema = z
  .object({
    label: graphLabelSchema,
    summary: graphSummarySchema,
    pinned: z.boolean(),
  })
  .strict();

export const graphNodeMutationSchema = z
  .object({
    labelOverride: graphLabelSchema.nullable(),
    summaryOverride: graphSummarySchema,
    state: graphPublicStateSchema,
    pinned: z.boolean(),
  })
  .strict();

export const graphConnectionMutationSchema = z
  .object({
    sourceId: graphNodeIdSchema,
    targetId: graphNodeIdSchema,
    kind: z.enum(["tag", "link", "semantic"]),
  })
  .strict()
  .refine((value) => value.sourceId !== value.targetId, {
    path: ["targetId"],
    message: "A node cannot connect to itself",
  });

export const graphSuggestionDecisionSchema = z
  .object({
    sourceId: graphNodeIdSchema,
    targetKey: graphKeySchema,
    targetLabel: graphLabelSchema,
    state: graphPublicStateSchema,
  })
  .strict();

export const graphMutationSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("updateNode"),
      id: graphNodeIdSchema,
      expectedVersion: z.number().int().positive(),
      node: graphNodeMutationSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("setNodeState"),
      id: graphNodeIdSchema,
      expectedVersion: z.number().int().positive(),
      state: graphPublicStateSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("connectNodes"),
      sourceId: graphNodeIdSchema,
      targetId: graphNodeIdSchema,
      kind: z.enum(["tag", "link", "semantic"]),
    })
    .strict()
    .refine((value) => value.sourceId !== value.targetId, {
      path: ["targetId"],
      message: "A node cannot connect to itself",
    }),
  z
    .object({
      action: z.literal("setEdgeState"),
      id: z.uuid(),
      expectedVersion: z.number().int().positive(),
      state: graphPublicStateSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("decideSuggestion"),
      suggestion: graphSuggestionDecisionSchema,
    })
    .strict(),
]);

export type GraphConceptMutation = z.infer<typeof graphConceptMutationSchema>;
export type GraphNodeMutation = z.infer<typeof graphNodeMutationSchema>;
export type GraphSuggestionDecision = z.infer<
  typeof graphSuggestionDecisionSchema
>;
