import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

export const MEDIA_LIMITS = Object.freeze({
  imageBytes: 4_000_000,
  documentBytes: 2_000_000,
  imageWidth: 12_000,
  imageHeight: 12_000,
  imagePixels: 40_000_000,
} as const);

export type MediaValidationErrorCode =
  | "empty_file"
  | "unsupported_type"
  | "mime_mismatch"
  | "file_too_large"
  | "invalid_image"
  | "invalid_dimensions"
  | "excessive_pixels";

export class MediaValidationError extends Error {
  readonly code: MediaValidationErrorCode;
  readonly originalFilename: string;

  constructor(
    code: MediaValidationErrorCode,
    message: string,
    originalFilename: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "MediaValidationError";
    this.code = code;
    this.originalFilename = originalFilename;
  }
}

export type MediaValidationInput = {
  bytes: Uint8Array;
  declaredMime: string;
  originalFilename: string;
};

type ValidatedImage = {
  kind: "image";
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/avif";
  extension: "jpg" | "png" | "webp" | "avif";
  byteSize: number;
  width: number;
  height: number;
};

type ValidatedDocument = {
  kind: "document";
  mimeType: "application/pdf";
  extension: "pdf";
  byteSize: number;
  width: null;
  height: null;
};

export type ValidatedMedia = ValidatedImage | ValidatedDocument;

type SupportedFormat =
  | Pick<ValidatedImage, "kind" | "mimeType" | "extension">
  | Pick<ValidatedDocument, "kind" | "mimeType" | "extension">;

const SUPPORTED_FORMATS: Readonly<Record<string, SupportedFormat>> = {
  "image/jpeg": { kind: "image", mimeType: "image/jpeg", extension: "jpg" },
  "image/png": { kind: "image", mimeType: "image/png", extension: "png" },
  "image/webp": { kind: "image", mimeType: "image/webp", extension: "webp" },
  "image/avif": { kind: "image", mimeType: "image/avif", extension: "avif" },
  "application/pdf": {
    kind: "document",
    mimeType: "application/pdf",
    extension: "pdf",
  },
};

function validationError(
  input: MediaValidationInput,
  code: MediaValidationErrorCode,
  message: string,
  cause?: unknown
) {
  return new MediaValidationError(code, message, input.originalFilename, { cause });
}

function normalizedMime(value: string) {
  return value.trim().toLowerCase();
}

export async function validateMediaBytes(
  input: MediaValidationInput
): Promise<ValidatedMedia> {
  if (input.bytes.byteLength === 0) {
    throw validationError(input, "empty_file", "The uploaded file is empty");
  }

  let detected: Awaited<ReturnType<typeof fileTypeFromBuffer>>;
  try {
    detected = await fileTypeFromBuffer(input.bytes);
  } catch (cause) {
    throw validationError(
      input,
      "unsupported_type",
      "The uploaded bytes do not have a supported file signature",
      cause
    );
  }

  const format = detected ? SUPPORTED_FORMATS[detected.mime] : undefined;
  if (!format) {
    throw validationError(
      input,
      "unsupported_type",
      "Only JPEG, PNG, WebP, AVIF, and PDF files are supported"
    );
  }

  const declaredMime = normalizedMime(input.declaredMime);
  if (declaredMime && declaredMime !== format.mimeType) {
    throw validationError(
      input,
      "mime_mismatch",
      "The declared media type does not match the uploaded bytes"
    );
  }

  const byteLimit =
    format.kind === "image" ? MEDIA_LIMITS.imageBytes : MEDIA_LIMITS.documentBytes;
  if (input.bytes.byteLength > byteLimit) {
    throw validationError(
      input,
      "file_too_large",
      `The uploaded ${format.kind} exceeds its byte limit`
    );
  }

  if (format.kind === "document") {
    return {
      ...format,
      byteSize: input.bytes.byteLength,
      width: null,
      height: null,
    };
  }

  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(input.bytes, {
      failOn: "error",
      limitInputPixels: false,
    }).metadata();
  } catch (cause) {
    throw validationError(
      input,
      "invalid_image",
      "The uploaded image could not be decoded",
      cause
    );
  }

  const { width, height } = metadata;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    !width ||
    !height ||
    width < 1 ||
    height < 1 ||
    width > MEDIA_LIMITS.imageWidth ||
    height > MEDIA_LIMITS.imageHeight
  ) {
    throw validationError(
      input,
      "invalid_dimensions",
      "The uploaded image dimensions are invalid or exceed their limits"
    );
  }

  if (width * height > MEDIA_LIMITS.imagePixels) {
    throw validationError(
      input,
      "excessive_pixels",
      "The uploaded image exceeds its decoded pixel limit"
    );
  }

  try {
    await sharp(input.bytes, {
      failOn: "error",
      limitInputPixels: MEDIA_LIMITS.imagePixels,
    }).stats();
  } catch (cause) {
    throw validationError(
      input,
      "invalid_image",
      "The uploaded image could not be decoded",
      cause
    );
  }

  return {
    ...format,
    byteSize: input.bytes.byteLength,
    width,
    height,
  };
}
