import { renderToStaticMarkup } from "react-dom/server";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PUBLIC_PROFILE } from "@/lib/public-profile";

const mocks = vi.hoisted(() => ({
  getPublicProfile: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile,
}));

vi.mock("@/lib/public-profile", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/public-profile")>()),
  getPublicProfile: mocks.getPublicProfile,
}));

vi.mock("next/og", () => ({
  ImageResponse: class ImageResponse {
    element: React.ReactElement;
    options: { width: number; height: number };

    constructor(
      element: React.ReactElement,
      options: { width: number; height: number }
    ) {
      this.element = element;
      this.options = options;
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  mocks.getPublicProfile.mockReset();
  mocks.readFile.mockReset();
  mocks.getPublicProfile.mockResolvedValue(DEFAULT_PUBLIC_PROFILE);
  mocks.readFile.mockResolvedValue(Buffer.from("portrait-jpeg"));
});

describe("root social preview", () => {
  it("renders the approved identity and portrait", async () => {
    const { SocialCard } = await import("./social-card");
    expect(SocialCard).toBeTypeOf("function");

    const html = renderToStaticMarkup(
      <SocialCard profile={DEFAULT_PUBLIC_PROFILE} />
    );

    expect(html).toContain("Pablo Pupo");
    expect(html).toContain("AI Engineer at Handtevy");
    expect(html).toContain("Classical piano");
    expect(html).toContain("Software");
    expect(html).not.toContain("Open source");
    expect(html).toContain("Miami, Florida");
    expect(html).toContain("pablo-pupo-portrait.jpg");
  });

  it("exports a 1200 by 630 production image", async () => {
    const image = await import("./opengraph-image").catch(() => undefined);
    expect(image?.default).toBeTypeOf("function");
    expect(image).toMatchObject({
      alt: "Pablo Pupo, AI engineer and classical pianist",
      contentType: "image/png",
      revalidate: 60,
      runtime: "nodejs",
      size: { width: 1200, height: 630 },
    });

    const response = (await image!.default()) as unknown as {
      element: React.ReactElement;
      options: { width: number; height: number };
    };
    expect(response.options).toEqual({ width: 1200, height: 630 });
    const html = renderToStaticMarkup(response.element);
    expect(html).toContain("AI Engineer at Handtevy");
    expect(html).toContain(
      `data:image/jpeg;base64,${Buffer.from("portrait-jpeg").toString("base64")}`
    );
    expect(mocks.readFile).toHaveBeenCalledWith(
      join(
        process.cwd(),
        "public",
        "media",
        "pablo-pupo-portrait.jpg"
      )
    );
  });

  it("keeps UI-managed portrait URLs without reading arbitrary local paths", async () => {
    mocks.getPublicProfile.mockResolvedValue({
      ...DEFAULT_PUBLIC_PROFILE,
      portraitUrl: "https://assets.example.com/current-portrait.jpg",
    });
    const image = await import("./opengraph-image");

    const response = (await image.default()) as unknown as {
      element: React.ReactElement;
    };
    const html = renderToStaticMarkup(response.element);

    expect(html).toContain("https://assets.example.com/current-portrait.jpg");
    expect(mocks.readFile).not.toHaveBeenCalled();
  });
});
