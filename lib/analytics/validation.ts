import { z } from "zod";

const sessionIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

const publicPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((path) => {
    if (!path.startsWith("/") || path.startsWith("//")) return false;
    if (/[?#\\\u0000-\u001f\u007f]/.test(path)) return false;
    return !["/admin", "/api", "/_next"].some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`)
    );
  });

const referrerSchema = z
  .string()
  .max(512)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  })
  .transform((value) => {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  });

const trimmedProperty = (maximum: number) =>
  z.string().trim().min(1).max(maximum).optional();

const propertiesSchema = z
  .object({
    viewportWidth: z.number().int().min(1).max(10_000).optional(),
    viewportHeight: z.number().int().min(1).max(10_000).optional(),
    language: trimmedProperty(35),
    timezone: trimmedProperty(100),
    utmSource: trimmedProperty(200),
    utmMedium: trimmedProperty(200),
    utmCampaign: trimmedProperty(200),
    utmContent: trimmedProperty(200),
    utmTerm: trimmedProperty(200),
  })
  .strict();

const pageViewEventSchema = z
  .object({
    eventName: z.literal("page_view"),
    path: publicPathSchema,
    referrer: referrerSchema.nullable().optional().default(null),
    sessionId: sessionIdSchema,
    properties: propertiesSchema.optional().default({}),
  })
  .strict();

export type PageViewEvent = z.infer<typeof pageViewEventSchema>;

export function parsePageViewEvent(input: unknown): PageViewEvent | undefined {
  const result = pageViewEventSchema.safeParse(input);
  return result.success ? result.data : undefined;
}
