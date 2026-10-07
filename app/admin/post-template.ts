export type PostTemplate = "note" | "recording" | "engineering";

export function postTemplate(template: PostTemplate) {
  if (template === "recording") {
    return { kind: "performance" as const, section: "music" as const, tags: ["music", "piano"] };
  }
  return { kind: "note" as const, section: "writing" as const, tags: template === "engineering" ? ["engineering"] : [] };
}
