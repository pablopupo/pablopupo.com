import { describe, expect, it } from "vitest";
import {
  graphConceptMutationSchema,
  graphConnectionMutationSchema,
  graphMutationSchema,
  graphNodeMutationSchema,
  graphSuggestionDecisionSchema,
} from "./graph-validation";

const sourceId = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";

describe("graph concept validation", () => {
  it("accepts a trimmed concept while keeping its key server-derived", () => {
    expect(
      graphConceptMutationSchema.parse({
        label: "  Healthcare AI  ",
        summary: "  Applied systems used in clinical workflows.  ",
        pinned: true,
      })
    ).toEqual({
      label: "Healthcare AI",
      summary: "Applied systems used in clinical workflows.",
      pinned: true,
    });

    expect(
      graphConceptMutationSchema.safeParse({
        label: "Healthcare AI",
        summary: "Clinical systems.",
        pinned: false,
        key: "caller-controlled-key",
      }).success
    ).toBe(false);
  });

  it("rejects empty or oversized concept fields", () => {
    expect(
      graphConceptMutationSchema.safeParse({
        label: " ",
        summary: "Description",
        pinned: false,
      }).success
    ).toBe(false);
    expect(
      graphConceptMutationSchema.safeParse({
        label: "x".repeat(201),
        summary: "Description",
        pinned: false,
      }).success
    ).toBe(false);
    expect(
      graphConceptMutationSchema.safeParse({
        label: "Evaluation",
        summary: "x".repeat(501),
        pinned: false,
      }).success
    ).toBe(false);
  });
});

describe("graph node validation", () => {
  it("accepts only editable presentation fields", () => {
    expect(
      graphNodeMutationSchema.parse({
        labelOverride: "  AI systems  ",
        summaryOverride: "  Notes and projects about applied AI.  ",
        state: "public",
        pinned: true,
      })
    ).toEqual({
      labelOverride: "AI systems",
      summaryOverride: "Notes and projects about applied AI.",
      state: "public",
      pinned: true,
    });

    expect(
      graphNodeMutationSchema.safeParse({
        labelOverride: null,
        summaryOverride: null,
        state: "suggested",
        pinned: false,
      }).success
    ).toBe(false);
    expect(
      graphNodeMutationSchema.safeParse({
        labelOverride: null,
        summaryOverride: null,
        state: "hidden",
        pinned: false,
        kind: "oss",
      }).success
    ).toBe(false);
  });
});

describe("graph mutation validation", () => {
  it("accepts a node state transition with an optimistic version", () => {
    expect(
      graphMutationSchema.parse({
        action: "setNodeState",
        id: sourceId,
        expectedVersion: 3,
        state: "hidden",
      })
    ).toEqual({
      action: "setNodeState",
      id: sourceId,
      expectedVersion: 3,
      state: "hidden",
    });
  });

  it.each([
    { id: "not-a-uuid", expectedVersion: 1, state: "hidden" },
    { id: sourceId, expectedVersion: 0, state: "hidden" },
    { id: sourceId, expectedVersion: 1, state: "suggested" },
    { id: sourceId, expectedVersion: 1, state: "public", extra: true },
  ])("rejects a malformed node state transition", (mutation) => {
    expect(
      graphMutationSchema.safeParse({
        action: "setNodeState",
        ...mutation,
      }).success
    ).toBe(false);
  });
});

describe("graph connection validation", () => {
  it("rejects self-links before they reach the repository", () => {
    expect(
      graphConnectionMutationSchema.safeParse({
        sourceId,
        targetId: sourceId,
        kind: "semantic",
      }).success
    ).toBe(false);
    expect(
      graphConnectionMutationSchema.parse({
        sourceId,
        targetId,
        kind: "semantic",
      })
    ).toEqual({ sourceId, targetId, kind: "semantic" });
  });

  it("limits suggestion decisions to accepted or ignored states", () => {
    const suggestion = {
      sourceId,
      targetKey: "evaluation",
      targetLabel: "Evaluation",
    };

    expect(
      graphSuggestionDecisionSchema.safeParse({
        ...suggestion,
        state: "public",
      }).success
    ).toBe(true);
    expect(
      graphSuggestionDecisionSchema.safeParse({
        ...suggestion,
        state: "hidden",
      }).success
    ).toBe(true);
    expect(
      graphSuggestionDecisionSchema.safeParse({
        ...suggestion,
        state: "suggested",
      }).success
    ).toBe(false);
  });
});
