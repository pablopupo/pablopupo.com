import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  MEDIA_LIMITS,
  MediaValidationError,
  validateMediaBytes,
} from "./validation";

const imageFormats = [
  { extension: "jpg", mimeType: "image/jpeg", encode: "jpeg" },
  { extension: "png", mimeType: "image/png", encode: "png" },
  { extension: "webp", mimeType: "image/webp", encode: "webp" },
  { extension: "avif", mimeType: "image/avif", encode: "avif" },
] as const;

async function makeImage(
  encode: (typeof imageFormats)[number]["encode"],
  width = 3,
  height = 2
) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 24, g: 96, b: 168 },
    },
  })
    [encode]()
    .toBuffer();
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function pngWithDimensions(width: number, height: number) {
  const bytes = await makeImage("png");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  bytes.writeUInt32BE(crc32(bytes.subarray(12, 29)), 29);
  return bytes;
}

async function pngWithCorruptedPixels() {
  const bytes = await makeImage("png", 32, 32);
  const chunkTypeOffset = bytes.indexOf(Buffer.from("IDAT"));
  if (chunkTypeOffset < 4) {
    throw new Error("PNG fixture has no IDAT chunk");
  }
  const dataLength = bytes.readUInt32BE(chunkTypeOffset - 4);
  bytes[chunkTypeOffset + 4 + Math.floor(dataLength / 2)] ^= 0xff;
  return bytes;
}

async function expectValidationError(
  promise: Promise<unknown>,
  code: MediaValidationError["code"]
) {
  await expect(promise).rejects.toMatchObject({
    name: "MediaValidationError",
    code,
  });
}

describe("validateMediaBytes", () => {
  it("keeps the exported security limits immutable", () => {
    expect(Object.isFrozen(MEDIA_LIMITS)).toBe(true);
  });

  it.each(imageFormats)(
    "accepts decoded $mimeType bytes and returns canonical metadata",
    async ({ encode, extension, mimeType }) => {
      const bytes = await makeImage(encode);

      await expect(
        validateMediaBytes({
          bytes,
          declaredMime: mimeType,
          originalFilename: `portrait.${extension}`,
        })
      ).resolves.toEqual({
        kind: "image",
        mimeType,
        extension,
        byteSize: bytes.byteLength,
        width: 3,
        height: 2,
      });
    }
  );

  it("accepts Uint8Array input with an empty declared MIME", async () => {
    const buffer = await makeImage("png");
    const bytes = new Uint8Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    );

    await expect(
      validateMediaBytes({
        bytes,
        declaredMime: "",
        originalFilename: "portrait",
      })
    ).resolves.toMatchObject({ mimeType: "image/png", extension: "png" });
  });

  it("accepts a signed PDF as a document", async () => {
    const bytes = Buffer.from(
      "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"
    );

    await expect(
      validateMediaBytes({
        bytes,
        declaredMime: "application/pdf",
        originalFilename: "resume.pdf",
      })
    ).resolves.toEqual({
      kind: "document",
      mimeType: "application/pdf",
      extension: "pdf",
      byteSize: bytes.byteLength,
      width: null,
      height: null,
    });
  });

  it.each([
    ["SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ["GIF", Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64")],
    ["HTML", Buffer.from("<!doctype html><title>not media</title>")],
    ["empty data", Buffer.alloc(0)],
    ["unknown data", Buffer.from([0, 1, 2, 3, 4, 5])],
  ])("rejects %s bytes", async (_label, bytes) => {
    await expectValidationError(
      validateMediaBytes({
        bytes,
        declaredMime: "",
        originalFilename: "upload.bin",
      }),
      bytes.byteLength === 0 ? "empty_file" : "unsupported_type"
    );
  });

  it("rejects a declared MIME that disagrees with the bytes", async () => {
    const bytes = await makeImage("png");

    await expectValidationError(
      validateMediaBytes({
        bytes,
        declaredMime: "image/jpeg",
        originalFilename: "portrait.png",
      }),
      "mime_mismatch"
    );
  });

  it("rejects images and documents over their separate byte limits", async () => {
    const image = Buffer.concat([
      await makeImage("png"),
      Buffer.alloc(MEDIA_LIMITS.imageBytes),
    ]).subarray(0, MEDIA_LIMITS.imageBytes + 1);
    const document = Buffer.alloc(MEDIA_LIMITS.documentBytes + 1);
    document.write("%PDF-1.7\n");

    await expectValidationError(
      validateMediaBytes({
        bytes: image,
        declaredMime: "image/png",
        originalFilename: "large.png",
      }),
      "file_too_large"
    );
    await expectValidationError(
      validateMediaBytes({
        bytes: document,
        declaredMime: "application/pdf",
        originalFilename: "large.pdf",
      }),
      "file_too_large"
    );
  });

  it("rejects image signatures that Sharp cannot decode", async () => {
    const bytes = (await makeImage("png")).subarray(0, 24);

    await expectValidationError(
      validateMediaBytes({
        bytes,
        declaredMime: "image/png",
        originalFilename: "broken.png",
      }),
      "invalid_image"
    );
  });

  it("rejects corrupt pixel payloads after valid signatures and metadata", async () => {
    const bytes = await pngWithCorruptedPixels();
    await expect(sharp(bytes).metadata()).resolves.toMatchObject({
      width: 32,
      height: 32,
    });

    await expectValidationError(
      validateMediaBytes({
        bytes,
        declaredMime: "image/png",
        originalFilename: "corrupt.png",
      }),
      "invalid_image"
    );
  });

  it("rejects zero dimensions that Sharp cannot decode", async () => {
    for (const [width, height] of [
      [0, 2],
      [2, 0],
    ]) {
      await expectValidationError(
        validateMediaBytes({
          bytes: await pngWithDimensions(width, height),
          declaredMime: "image/png",
          originalFilename: "dimensions.png",
        }),
        "invalid_image"
      );
    }
  });

  it("rejects individually oversized dimensions", async () => {
    for (const [width, height] of [
      [MEDIA_LIMITS.imageWidth + 1, 1],
      [1, MEDIA_LIMITS.imageHeight + 1],
    ]) {
      await expectValidationError(
        validateMediaBytes({
          bytes: await pngWithDimensions(width, height),
          declaredMime: "image/png",
          originalFilename: "dimensions.png",
        }),
        "invalid_dimensions"
      );
    }
  });

  it("rejects excessive decoded pixel counts", async () => {
    await expectValidationError(
      validateMediaBytes({
        bytes: await pngWithDimensions(8_000, 6_000),
        declaredMime: "image/png",
        originalFilename: "pixel-bomb.png",
      }),
      "excessive_pixels"
    );
  });
});
