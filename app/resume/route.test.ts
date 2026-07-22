import { describe, expect, it, vi } from "vitest";

const fallbackResumeUrl = "/Pablo-Pupo-Resume.pdf";

function profile(resumeUrl: string) {
  return { resumeUrl };
}

async function setup(resumeUrl: string) {
  const module = await import("@/lib/resume-route").catch(() => undefined);
  expect(module?.createResumeRoute).toBeTypeOf("function");
  const getProfile = vi.fn().mockResolvedValue(profile(resumeUrl));
  return {
    module: module!,
    getProfile,
    GET: module!.createResumeRoute({ getProfile }),
  };
}

describe("resume route", () => {
  it("temporarily redirects to an HTTPS resume selected in the profile", async () => {
    const { GET, getProfile } = await setup(
      "https://assets.example.com/pablo-resume.pdf"
    );

    const response = await GET(new Request("https://pablopupo.com/resume"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://assets.example.com/pablo-resume.pdf"
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(getProfile).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["/media/current-resume.pdf", "https://pablopupo.com/media/current-resume.pdf"],
    ["documents/resume.pdf", "https://pablopupo.com/documents/resume.pdf"],
    ["http://assets.example.com/resume.pdf", "http://assets.example.com/resume.pdf"],
  ])("allows safe resume target %s", async (resumeUrl, expectedLocation) => {
    const { GET } = await setup(resumeUrl);

    const response = await GET(new Request("https://pablopupo.com/resume"));

    expect(response.headers.get("location")).toBe(expectedLocation);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,unsafe",
    "ftp://assets.example.com/resume.pdf",
    "//example.net/resume.pdf",
    "https://",
    "",
  ])("uses the static resume for unsafe target %s", async (resumeUrl) => {
    const { GET } = await setup(resumeUrl);

    const response = await GET(new Request("https://pablopupo.com/resume"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      `https://pablopupo.com${fallbackResumeUrl}`
    );
  });

  it("propagates profile read failures", async () => {
    const module = await import("@/lib/resume-route").catch(() => undefined);
    expect(module?.createResumeRoute).toBeTypeOf("function");
    const failure = new Error("database unavailable");
    const GET = module!.createResumeRoute({
      getProfile: vi.fn().mockRejectedValue(failure),
    });

    await expect(
      GET(new Request("https://pablopupo.com/resume"))
    ).rejects.toBe(failure);
  });

  it("exports the production route as dynamic", async () => {
    const module = await import("./route").catch(() => undefined);

    expect(module?.dynamic).toBe("force-dynamic");
    expect(module?.GET).toBeTypeOf("function");
  });
});
