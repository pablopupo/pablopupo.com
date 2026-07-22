import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const approvedAssets = [
  {
    path: "public/media/pablo-pupo-portrait.jpg",
    byteSize: 578_420,
    sha256: "a26ce2ad31296fb149e124517a0faecf31d2c3ed1a24ef44b59171ce3e0b57ea",
  },
  {
    path: "public/Pablo-Pupo-Resume.pdf",
    byteSize: 119_473,
    sha256: "9a1f7a93b1fe4a1b9879ad3fca8f589961d4f6085e895be11cc02b21a1b99096",
  },
] as const;

describe("approved public profile assets", () => {
  it.each(approvedAssets)("preserves $path byte-for-byte", (asset) => {
    const bytes = fs.readFileSync(path.join(process.cwd(), asset.path));

    expect(bytes).toHaveLength(asset.byteSize);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      asset.sha256
    );
  });

  it("keeps the approved portrait dimensions and format", async () => {
    const metadata = await sharp(
      path.join(process.cwd(), "public/media/pablo-pupo-portrait.jpg")
    ).metadata();

    expect(metadata).toMatchObject({
      format: "jpeg",
      width: 2848,
      height: 4272,
    });
  });

  it("serves the approved resume as a PDF", () => {
    const bytes = fs.readFileSync(
      path.join(process.cwd(), "public/Pablo-Pupo-Resume.pdf")
    );

    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
