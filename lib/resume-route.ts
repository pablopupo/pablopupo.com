import {
  DEFAULT_PUBLIC_PROFILE,
  getPublicProfile,
  type PublicProfile,
} from "./public-profile";

type ResumeRouteDependencies = {
  getProfile: () => Promise<Pick<PublicProfile, "resumeUrl">>;
};

function fallbackResumeUrl(requestUrl: string) {
  return new URL(DEFAULT_PUBLIC_PROFILE.resumeUrl, requestUrl);
}

function resumeTarget(requestUrl: string, candidate: string) {
  const request = new URL(requestUrl);
  const value = candidate.trim();
  if (!value) return fallbackResumeUrl(requestUrl);

  try {
    const resolved = new URL(value, request);
    const explicitProtocol = /^[a-z][a-z\d+.-]*:/i.test(value);
    const httpProtocol =
      resolved.protocol === "http:" || resolved.protocol === "https:";
    if (httpProtocol && (explicitProtocol || resolved.origin === request.origin)) {
      return resolved;
    }
  } catch {
    return fallbackResumeUrl(requestUrl);
  }

  return fallbackResumeUrl(requestUrl);
}

export function createResumeRoute(
  dependencies: ResumeRouteDependencies = { getProfile: getPublicProfile }
) {
  return async function GET(request: Request) {
    const profile = await dependencies.getProfile();
    return new Response(null, {
      status: 307,
      headers: {
        location: resumeTarget(request.url, profile.resumeUrl).href,
        "cache-control": "no-store",
      },
    });
  };
}
