import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import MediaManager, {
  formatByteSize,
  uploadMedia,
  validateMediaUpload,
} from "./media-manager";

describe("media manager", () => {
  it("requires alt text for images but not PDFs", () => {
    const image = new File(["image"], "portrait.jpg", { type: "image/jpeg" });
    const pdf = new File(["pdf"], "resume.pdf", { type: "application/pdf" });

    expect(validateMediaUpload(image, "", "content")).toBe(
      "Describe this image before uploading it"
    );
    expect(validateMediaUpload(image, "Pablo at a piano", "content")).toBeNull();
    expect(validateMediaUpload(pdf, "", "content")).toBeNull();
  });

  it("uploads multipart media with its purpose and alt text", async () => {
    const file = new File(["image"], "performance.webp", {
      type: "image/webp",
    });
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          media: {
            id: "media-id",
            url: "https://example.com/performance.webp",
            mimeType: "image/webp",
          },
        }),
        { status: 201, headers: { "content-type": "application/json" } }
      )
    );

    const result = await uploadMedia(
      { file, altText: "Pablo performing", purpose: "content" },
      fetcher
    );

    expect(result.status).toBe("uploaded");
    const [, request] = fetcher.mock.calls[0] as [string, RequestInit];
    const body = request.body as FormData;
    expect(body.get("file")).toBe(file);
    expect(body.get("altText")).toBe("Pablo performing");
    expect(body.get("purpose")).toBe("content");
  });

  it("renders upload controls, progress state, and readable sizes", () => {
    const html = renderToStaticMarkup(<MediaManager />);

    expect(html).toContain("Image or PDF");
    expect(html).toContain("Alt text");
    expect(html).toContain("Upload media");
    expect(html).toContain("No media loaded yet");
    expect(formatByteSize(1536)).toBe("1.5 KB");
  });
});
