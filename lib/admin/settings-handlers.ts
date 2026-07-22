import { z } from "zod";

type AdminAccess =
  | { status: "unconfigured" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "authorized"; userId: string };

type SettingsPatch = {
  siteTitle?: string;
  headline?: string;
  location?: string | null;
  graduationOn?: string | null;
  introMarkdown?: string;
  aboutMarkdown?: string;
  contactEmail?: string | null;
  githubUrl?: string | null;
  linkedinUrl?: string | null;
  youtubeUrl?: string | null;
  avatarMediaId?: string | null;
  resumeMediaId?: string | null;
};

type AdminSettingsRepository = {
  getSettings: () => Promise<unknown | undefined>;
  updateSettings: (
    expectedVersion: number,
    patch: SettingsPatch
  ) => Promise<unknown>;
};

type AdminSettingsHandlerDependencies = {
  authorize: (headers: Headers) => Promise<AdminAccess>;
  isSameOrigin: (request: Request) => boolean;
  revalidate: () => void;
  repository: AdminSettingsRepository;
};

const nullableTrimmed = (maximum: number) =>
  z.string().trim().max(maximum).nullable();

const graduationDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  })
  .nullable();

const nullableEmail = z
  .string()
  .trim()
  .max(254)
  .email()
  .nullable();

const nullableHttpUrl = z
  .string()
  .trim()
  .max(2_048)
  .url()
  .refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  })
  .nullable();

const settingsFields = z
  .object({
    siteTitle: z.string().trim().min(1).max(100),
    headline: z.string().trim().min(1).max(160),
    location: nullableTrimmed(120),
    graduationOn: graduationDate,
    introMarkdown: z.string().max(10_000),
    aboutMarkdown: z.string().max(100_000),
    contactEmail: nullableEmail,
    githubUrl: nullableHttpUrl,
    linkedinUrl: nullableHttpUrl,
    youtubeUrl: nullableHttpUrl,
    avatarMediaId: z.uuid().nullable(),
    resumeMediaId: z.uuid().nullable(),
  })
  .strict()
  .partial();

const updateSettingsSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    settings: settingsFields.refine(
      (value) => Object.keys(value).length > 0,
      { message: "at least one setting is required" }
    ),
  })
  .strict();

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

function repositoryErrorResponse(error: unknown) {
  if (error instanceof Error && error.name === "SettingsConflictError") {
    return Response.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof Error && error.name === "SettingsMediaTypeError") {
    return Response.json({ error: error.message }, { status: 422 });
  }
  if (error instanceof Error && error.name === "SettingsNotFoundError") {
    return Response.json({ error: error.message }, { status: 404 });
  }
  return Response.json({ error: "request failed" }, { status: 500 });
}

export function createAdminSettingsHandlers(
  dependencies: AdminSettingsHandlerDependencies
) {
  return {
    async load(request: Request) {
      const rejection = accessResponse(
        await dependencies.authorize(request.headers)
      );
      if (rejection) return rejection;
      const settings = await dependencies.repository.getSettings();
      if (!settings) {
        return Response.json({ error: "settings not found" }, { status: 404 });
      }
      return Response.json({ settings });
    },

    async update(request: Request) {
      const rejection = accessResponse(
        await dependencies.authorize(request.headers)
      );
      if (rejection) return rejection;
      if (!dependencies.isSameOrigin(request)) {
        return Response.json(
          { error: "same-origin request required" },
          { status: 403 }
        );
      }
      const input = updateSettingsSchema.safeParse(
        await request.json().catch(() => undefined)
      );
      if (!input.success) {
        return Response.json(
          { error: "validation failed", issues: input.error.flatten() },
          { status: 422 }
        );
      }
      const { expectedVersion, settings: patch } = input.data;
      try {
        const settings = await dependencies.repository.updateSettings(
          expectedVersion,
          patch
        );
        dependencies.revalidate();
        return Response.json({ settings });
      } catch (error) {
        return repositoryErrorResponse(error);
      }
    },
  };
}
