import { createHash } from "node:crypto";
import { z } from "zod";
import {
  MEDIA_LIMITS,
  type MediaValidationInput,
  type ValidatedMedia,
} from "../media/validation";

type AdminAccess =
  | { status: "unconfigured" }
  | { status: "unauthenticated" }
  | { status: "forbidden" }
  | { status: "authorized"; userId: string };

type MediaPurpose = "profile" | "resume" | "content";

type CreateMediaInput = {
  storageKey: string;
  url: string;
  provider: "vercel-blob";
  purpose: MediaPurpose;
  originalFilename: string;
  sha256: string;
  mimeType: ValidatedMedia["mimeType"];
  altText: string | null;
  width: number | null;
  height: number | null;
  byteSize: number;
};

type AdminMediaRepository = {
  listMedia: () => Promise<unknown>;
  createMedia: (input: CreateMediaInput) => Promise<unknown>;
};

type BlobPutOptions = {
  access: "public";
  addRandomSuffix: false;
  contentType: string;
  maximumSizeInBytes: number;
  token?: string;
};

type AdminMediaHandlerDependencies = {
  authorize: (headers: Headers) => Promise<AdminAccess>;
  isSameOrigin: (request: Request) => boolean;
  storageConfigured: boolean;
  blobToken: string | undefined;
  randomUUID: () => string;
  validateMediaBytes: (
    input: MediaValidationInput
  ) => Promise<ValidatedMedia>;
  putBlob: (
    pathname: string,
    bytes: Uint8Array,
    options: BlobPutOptions
  ) => Promise<{ url: string }>;
  deleteBlob: (url: string, options: { token?: string }) => Promise<void>;
  repository: AdminMediaRepository;
};

const uploadFieldsSchema = z
  .object({
    altText: z.string().trim().max(500),
    purpose: z.enum(["profile", "resume", "content"]),
    originalFilename: z.string().trim().min(1).max(255),
    declaredMime: z.string().trim().max(255),
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

function validationResponse(message = "validation failed") {
  return Response.json({ error: message }, { status: 422 });
}

function validatePurpose(purpose: MediaPurpose, media: ValidatedMedia) {
  if (purpose === "profile" && media.kind !== "image") {
    return "profile media must be an image";
  }
  if (purpose === "resume" && media.mimeType !== "application/pdf") {
    return "resume media must be a PDF";
  }
  return undefined;
}

export function createAdminMediaHandlers(
  dependencies: AdminMediaHandlerDependencies
) {
  return {
    async list(request: Request) {
      const rejection = accessResponse(
        await dependencies.authorize(request.headers)
      );
      if (rejection) return rejection;
      return Response.json({ media: await dependencies.repository.listMedia() });
    },

    async upload(request: Request) {
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
      if (!dependencies.storageConfigured) {
        return Response.json(
          { error: "media storage is not configured" },
          { status: 503 }
        );
      }
      const blobToken = dependencies.blobToken?.trim() || undefined;

      const form = await request.formData().catch(() => undefined);
      if (!form) return validationResponse();
      const file = form.get("file");
      if (!(file instanceof File)) return validationResponse();
      const fields = uploadFieldsSchema.safeParse({
        altText: form.get("altText") ?? "",
        purpose: form.get("purpose"),
        originalFilename: file.name,
        declaredMime: file.type,
      });
      if (!fields.success) return validationResponse();
      if (file.size > MEDIA_LIMITS.imageBytes) {
        return validationResponse("uploaded file exceeds its byte limit");
      }

      const bytes = new Uint8Array(await file.arrayBuffer());
      let verified: ValidatedMedia;
      try {
        verified = await dependencies.validateMediaBytes({
          bytes,
          declaredMime: fields.data.declaredMime,
          originalFilename: fields.data.originalFilename,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "MediaValidationError") {
          return validationResponse(error.message);
        }
        return Response.json({ error: "media validation failed" }, { status: 500 });
      }

      if (verified.kind === "image" && !fields.data.altText) {
        return validationResponse("image alt text is required");
      }
      const purposeError = validatePurpose(fields.data.purpose, verified);
      if (purposeError) return validationResponse(purposeError);

      const storageKey = `uploads/${dependencies.randomUUID()}.${verified.extension}`;
      let uploaded: { url: string };
      try {
        uploaded = await dependencies.putBlob(storageKey, bytes, {
          access: "public",
          addRandomSuffix: false,
          contentType: verified.mimeType,
          maximumSizeInBytes: MEDIA_LIMITS.imageBytes,
          ...(blobToken ? { token: blobToken } : {}),
        });
      } catch {
        return Response.json({ error: "media upload failed" }, { status: 502 });
      }

      try {
        const media = await dependencies.repository.createMedia({
          storageKey,
          url: uploaded.url,
          provider: "vercel-blob",
          purpose: fields.data.purpose,
          originalFilename: fields.data.originalFilename,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          mimeType: verified.mimeType,
          altText: verified.kind === "image" ? fields.data.altText : null,
          width: verified.width,
          height: verified.height,
          byteSize: verified.byteSize,
        });
        return Response.json({ media }, { status: 201 });
      } catch {
        await dependencies
          .deleteBlob(uploaded.url, blobToken ? { token: blobToken } : {})
          .catch(() => undefined);
        return Response.json({ error: "request failed" }, { status: 500 });
      }
    },
  };
}
