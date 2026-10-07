import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

const approvedAssets = [
  {
    path: "public/media/pablo-pupo-portrait.jpg",
    byteSize: 30_071,
    sha256: "ecc5d0f3a1f47715783a9cf604de128a18a89ec1b2f7df6357a1e31a500b2dfc",
  },
  {
    path: "public/Pablo-Pupo-Resume.pdf",
    byteSize: 119_373,
    sha256: "8c3b66df6caa16d40516eb9295b62494b5b4b003ee05bf7769b7c21338272369",
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
      width: 460,
      height: 460,
    });
  });

  it("serves the approved resume as a PDF", () => {
    const bytes = fs.readFileSync(
      path.join(process.cwd(), "public/Pablo-Pupo-Resume.pdf")
    );

    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
